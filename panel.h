#ifndef PANEL_H
#define PANEL_H

#include <QObject>
#include <QTimer>
#include <QMutex>
#include <QElapsedTimer>
#include <QMetaObject>
#include <cstdint>
#include <cstring>
#include <algorithm>
#include <vector>

// Coalesce e-ink refreshes. Qt still paints every frame into the framebuffer,
// but MXCFB_SEND_UPDATE is held until the damage goes quiet. A swipe therefore
// sends one refresh when it settles, not one per frame.
//
// Damage stays as separate rectangles. Two rects merge only when they overlap
// or the gap between their edges is at most 40px, so a key at the bottom and
// the search field at the top are not one update. flush() sends each remaining
// rect with its own MXCFB_SEND_UPDATE.
//
// Waveforms (rm2fb / EPFramebuffer):
//   0 INIT  full white clear. Used only for an intentional blank flash.
//   1 DU    fast mono. Typing and ordinary UI, including a settled swipe.
//   3 GC16  gray. Only a rect observed while markGray() is set (a cover
//           finished). Other rects in the same flush stay DU.
// Update mode stays partial (0). Ghosting on DU is accepted.
class PanelRefresh : public QObject
{
    Q_OBJECT
public:
    using IoctlFn = int (*)(int, unsigned long, ...);

    static constexpr unsigned long SEND_UPDATE = 0x4048462eUL;
    // _IOWR('F', 0x2F, mxcfb_update_marker_data), 8-byte payload.
    static constexpr unsigned long WAIT_UPDATE = 0xC008462FUL;
    static constexpr int WORDS = 24; // ioctl payload is 72 bytes; keep slack
    // Merge only overlapping rects or rects whose edges are within this gap.
    static constexpr uint32_t MERGE_GAP = 40;

    explicit PanelRefresh(IoctlFn real, QObject *parent = nullptr)
        : QObject(parent), m_real(real)
    {
        m_timer.setSingleShot(true);
        connect(&m_timer, &QTimer::timeout, this, [this]() { flush(); });
    }

    // Called from the thread that issued ioctl. Does not send.
    void observe(int fd, uint32_t *words)
    {
        QMutexLocker guard(&m_lock);
        m_fd = fd;
        Damage incoming;
        std::memcpy(incoming.words, words, 72);
        incoming.top = words[0];
        incoming.left = words[1];
        incoming.right = words[1] + words[2];
        incoming.bottom = words[0] + words[3];
        // Gray sticks to this rect, not to every other rect flushed with it.
        incoming.gray = m_grayscale;
        if (incoming.right > incoming.left && incoming.bottom > incoming.top) {
            if (m_rects.empty())
                m_dirtySince.restart();
            addDamage(incoming);
        }
        m_dirty = !m_rects.empty();
        guard.unlock();
        // Always debounce. Delay 0 here used to push every swipe frame.
        QMetaObject::invokeMethod(this, "arm", Qt::QueuedConnection, Q_ARG(int, 120));
    }

    // DU (or GC16 if a cover finished) once the current damage settles.
    Q_INVOKABLE void bump()
    {
        QMutexLocker guard(&m_lock);
        if (m_blank)
            return;
        guard.unlock();
        arm(40);
    }

    // Blank-clear the damaged rect when it settles, then draw it again.
    // Page buttons and overlay open/close use this so stuck pixels clear.
    Q_INVOKABLE void flash()
    {
        {
            QMutexLocker guard(&m_lock);
            m_blank = true;
        }
        arm(120);
    }

    // Rects observed from here until the next flush paint gray levels.
    // DU would flatten covers. Already-queued rects are left as DU.
    Q_INVOKABLE void markGray()
    {
        QMutexLocker guard(&m_lock);
        m_grayscale = true;
    }

    Q_INVOKABLE void arm(int ms)
    {
        // Never let new paint postpone an already scheduled update. This bounds
        // latency even while covers arrive or a finger keeps moving.
        const int delay = std::max(0, ms);
        if (!m_timer.isActive() || m_timer.remainingTime() > delay)
            m_timer.start(delay);
    }

    void flush()
    {
        std::vector<Damage> rects;
        int fd = -1;
        bool blank = false;
        {
            QMutexLocker guard(&m_lock);
            if (!m_dirty || m_fd < 0 || m_real == nullptr || m_rects.empty())
                return;
            rects.swap(m_rects);
            blank = m_blank;
            fd = m_fd;
            m_grayscale = false;
            m_blank = false;
            m_dirty = false;
        }
        for (const Damage &damage : rects) {
            uint32_t local[WORDS];
            std::memcpy(local, damage.words, sizeof(local));
            local[0] = damage.top;
            local[1] = damage.left;
            local[2] = damage.right > damage.left ? damage.right - damage.left : 0;
            local[3] = damage.bottom > damage.top ? damage.bottom - damage.top : 0;
            if (local[2] == 0 || local[3] == 0)
                continue;
            local[5] = 0; // partial
            if (blank) {
                uint32_t clear[WORDS];
                std::memcpy(clear, local, sizeof(clear));
                clear[4] = 0; // INIT: white blank, clears stuck pixels
                clear[5] = 0;
                m_real(fd, SEND_UPDATE, clear);
            }
            // GC16 only for a rect observed while a cover had markGray() set.
            local[4] = damage.gray ? 3u : 1u;
            m_real(fd, SEND_UPDATE, local);
        }
    }

private:
    struct Damage {
        uint32_t words[WORDS] = {};
        uint32_t top = 0;
        uint32_t left = 0;
        uint32_t right = 0;
        uint32_t bottom = 0;
        bool gray = false;
    };

    // True when the rects overlap or the gap between edges is <= MERGE_GAP.
    static bool nearEnough(const Damage &a, const Damage &b)
    {
        const uint64_t gap = MERGE_GAP;
        const bool xFar =
            static_cast<uint64_t>(a.right) + gap < b.left ||
            static_cast<uint64_t>(b.right) + gap < a.left;
        const bool yFar =
            static_cast<uint64_t>(a.bottom) + gap < b.top ||
            static_cast<uint64_t>(b.bottom) + gap < a.top;
        return !xFar && !yFar;
    }

    // Caller holds m_lock. Folds incoming into any near rect, transitively.
    void addDamage(Damage incoming)
    {
        bool merged = true;
        while (merged) {
            merged = false;
            for (size_t i = 0; i < m_rects.size(); ++i) {
                if (!nearEnough(m_rects[i], incoming))
                    continue;
                incoming.top = std::min(incoming.top, m_rects[i].top);
                incoming.left = std::min(incoming.left, m_rects[i].left);
                incoming.right = std::max(incoming.right, m_rects[i].right);
                incoming.bottom = std::max(incoming.bottom, m_rects[i].bottom);
                incoming.gray = incoming.gray || m_rects[i].gray;
                m_rects.erase(m_rects.begin() + static_cast<std::ptrdiff_t>(i));
                merged = true;
                break;
            }
        }
        m_rects.push_back(incoming);
    }

    IoctlFn m_real = nullptr;
    QTimer m_timer;
    QMutex m_lock;
    QElapsedTimer m_dirtySince;
    int m_fd = -1;
    bool m_dirty = false;
    bool m_grayscale = false;
    bool m_blank = false;
    std::vector<Damage> m_rects;
};

#endif
