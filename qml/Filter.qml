import QtQuick 2.5
import QtQuick.Controls 2.4
import "Theme.js" as Theme

Item {
    id: root
    signal activated(int index);
    property alias model: combo.model
    property alias text: name.text
    property alias curIndex: combo.currentIndex

    function setDefault(value) {
        const id = combo.find(value, Qt.MatchExactly);
        if (id !== -1) combo.currentIndex = id;
        else combo.currentIndex = 0;
    }

    function reset() {
        combo.currentIndex = 0;
    }

    function value() {
        return combo.currentText;
    }

    height: 100

    Text {
        id: name
        font.pixelSize: Theme.fontSizeBody + 10
        font.family: Theme.fontFamily
        font.styleName: "Bold"
    }
    ComboBox {
        id: combo
        anchors {
            top: name.bottom
            topMargin: Theme.marginSmall
        }
        width: parent.width
        height: Math.max(Theme.minTouchSize, 60)
        font.family: Theme.fontFamily
        font.pixelSize: Theme.fontSizeBody

        background: Rectangle {
            border.width: Theme.borderWidth
            border.color: Theme.colorPrimary
            color: Theme.colorSurface
            radius: Theme.radiusCard
        }
        contentItem: Label {
            text: combo.currentText
            font: combo.font
            elide: Text.ElideRight
            anchors {
                left: parent.left
                leftMargin: 15
                verticalCenter: parent.verticalCenter
                verticalCenterOffset: 2
            }
            verticalAlignment: Text.AlignVCenter
            color: Theme.colorText
        }

        delegate: ItemDelegate {
            width: combo.popup.width - 20
            height: Math.max(Theme.minTouchSize, 60)
            contentItem: Text {
                text: modelData
                color: Theme.colorText
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSizeBody
                font.bold: combo.highlightedIndex === index
                elide: Text.ElideRight
                verticalAlignment: Text.AlignVCenter
            }
        }

        popup: Popup {
            y: combo.height + Theme.marginSmall
            width: root.width
            implicitHeight: Math.min(contentItem.contentHeight + 20, 600)
            clip: true
            contentItem: ListView {
                implicitHeight: contentHeight
                model: combo.popup.visible ? combo.delegateModel : null
                currentIndex: combo.highlightedIndex
                clip: true
                boundsBehavior: Flickable.StopAtBounds
                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
            }

            background: Rectangle {
                border.color: Theme.colorPrimary
                border.width: Theme.borderWidth
                radius: Theme.radiusCard
            }
        }

        onActivated: function(index) { root.activated(index) }
    }
}