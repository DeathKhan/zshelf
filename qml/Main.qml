import QtQuick 2.11
import QtQuick.Controls 2.4
import QtQuick.Layouts 1.11
import "Theme.js" as Theme

Rectangle {
    id: canvas
    width: screenGeometry.width
    height: screenGeometry.height
    color: Theme.colorSurface
    readonly property int columns: Math.max(2, Math.min(4, Math.floor(libView.width / 280)))
    readonly property int rows: Math.max(1, Math.min(3, Math.floor(libView.height / 440)))
    readonly property int itemPerPage: rows * columns
    property int visiblePage: 0
    property bool loginPrompted: false
    Component.onCompleted: { store.pageSize = itemPerPage; store.ensureBooks(itemPerPage) }
    onItemPerPageChanged: { store.pageSize = itemPerPage; store.ensureBooks((visiblePage + 1) * itemPerPage) }
    onVisiblePageChanged: store.ensureBooks((visiblePage + 1) * itemPerPage)

    function movePage(delta) {
        var last = Math.ceil(libView.count / itemPerPage) - (store.canLoadMore ? 0 : 1)
        var page = Math.max(0, Math.min(last, visiblePage + delta))
        visiblePage = page
        libView.currentIndex = page * itemPerPage
        libView.positionViewAtIndex(libView.currentIndex, GridView.Beginning)
        if (typeof panel !== "undefined") panel.flash()
    }

    ColumnLayout {
        id: headerBar
        anchors { left: parent.left; right: parent.right; top: parent.top; margins: Theme.margin }
        spacing: 20
        RowLayout {
            Layout.fillWidth: true
            spacing: 16
            Text {
                text: "Shelf"
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSizeTitle
                font.bold: true
                Layout.fillWidth: true
            }
            FlatButton { text: "Saved"; onTapped: store.openSavedList(0) }
            FlatButton {
                text: store.adultCategories ? "Romance on" : "Romance off"
                onTapped: store.setAdultCategories(!store.adultCategories)
            }
            FlatButton { text: "Downloads"; onTapped: downloadList.open() }
            FlatButton { text: store.signedIn ? "Account" : "Sign in"; onTapped: loginUI.openLogin(true) }
            FlatButton { text: "Settings"; onTapped: settingsUI.openSettings(true) }
            FlatButton { text: "Close"; onTapped: Qt.quit() }
        }
        RowLayout {
            Layout.fillWidth: true
            spacing: 16
            FlatButton {
                Layout.fillWidth: true
                text: store.query.length ? store.query : "Search books, authors or ISBN"
                onTapped: queryUI.openSearch(true)
            }
            FlatButton {
                text: "Search & filters"
                bgColor: Theme.colorPrimary
                fgColor: Theme.colorTextInverse
                onTapped: queryUI.openSearch(true)
            }
        }
    }

    GridView {
        id: libView
        objectName: "libView"
        anchors {
            left: parent.left; right: parent.right
            top: headerBar.bottom; bottom: footer.top
            leftMargin: Theme.margin; rightMargin: Theme.margin
            topMargin: 30; bottomMargin: 20
        }
        cellWidth: width / canvas.columns
        cellHeight: height / canvas.rows
        model: store.bookModel
        boundsBehavior: Flickable.StopAtBounds
        flow: GridView.TopToBottom
        flickableDirection: Flickable.HorizontalFlick
        snapMode: GridView.SnapToRow
        highlightMoveDuration: 0
        clip: true
        cacheBuffer: Math.round(width)
        onMovementEnded: {
            var targetPage = Math.round(contentX / width)
            canvas.visiblePage = Math.max(0, Math.min(targetPage, Math.ceil(count / canvas.itemPerPage) - 1))
            var targetIndex = canvas.visiblePage * canvas.itemPerPage
            currentIndex = Math.max(0, Math.min(targetIndex, count - 1))
            positionViewAtIndex(currentIndex, GridView.Beginning)
            if (typeof panel !== "undefined") panel.bump()
        }
        // Pad the last page so it can align without repeating the previous books.
        footer: Item {
            width: Math.max(0, Math.ceil(libView.count / canvas.itemPerPage) * libView.width - Math.ceil(libView.count / canvas.rows) * libView.cellWidth)
            height: libView.height
        }
        onCountChanged: {
            if (!count) {
                canvas.visiblePage = 0;
                currentIndex = 0;
                positionViewAtBeginning();
            } else {
                Qt.callLater(function() {
                    canvas.visiblePage = Math.min(canvas.visiblePage, Math.max(0, Math.ceil(libView.count / canvas.itemPerPage) - 1));
                    libView.currentIndex = canvas.visiblePage * canvas.itemPerPage;
                    libView.positionViewAtIndex(libView.currentIndex, GridView.Beginning);
                });
            }
        }
        delegate: BookCard {
            width: libView.cellWidth
            height: libView.cellHeight
            book: model.bookObject
            onClicked: itemInfo.showBook(tappedBook)
        }

    }

    ColumnLayout {
        id: footer
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom; margins: Theme.margin }
        spacing: 12
        RowLayout {
            Layout.fillWidth: true
            FlatButton { text: "Previous"; enabled: canvas.visiblePage > 0; onTapped: canvas.movePage(-1) }
            Text {
                Layout.fillWidth: true
                horizontalAlignment: Text.AlignHCenter
                text: libView.count ? "Page " + (canvas.visiblePage + 1) + " / " + Math.ceil(libView.count / canvas.itemPerPage) + (store.listLoading ? " · Checking…" : "") : "No books"
                font.family: Theme.fontFamily; font.pixelSize: Theme.fontSizeBody
            }
            FlatButton { text: "Next"; enabled: canvas.visiblePage + 1 < Math.ceil(libView.count / canvas.itemPerPage) || store.canLoadMore; onTapped: canvas.movePage(1) }
            FlatButton { text: "Stop checking"; visible: store.listLoading; onTapped: store.stopQuery() }
            FlatButton { text: "Retry"; visible: !store.listLoading && storeError.length > 0; onTapped: store.retryQuery() }
        }
        Text {
            Layout.fillWidth: true
            visible: !store.listLoading && storeError.length > 0 && store.books.length > 0
            text: "Could not load more results. Tap Retry to continue."
            font.pixelSize: Theme.fontSizeSmall
            horizontalAlignment: Text.AlignHCenter
        }
        FlatButton { Layout.fillWidth: true; text: store.accountStatus; onTapped: store.refreshAccount() }
    }
    Text {
        anchors.centerIn: libView
        width: libView.width - 60
        visible: storeError.length > 0 && !store.listLoading && !store.books.length
        text: storeError
        wrapMode: Text.Wrap
        horizontalAlignment: Text.AlignHCenter
        font.pixelSize: Theme.fontSizeBody
    }
    Query { id: queryUI; anchors.fill: parent; storeFront: store; z: 20 }
    Login { id: loginUI; anchors.fill: parent; storeFront: store; z: 21 }
    Settings { id: settingsUI; anchors.fill: parent; storeFront: store; z: 22 }
    BookPopup { id: itemInfo }
    DownloadPopup { id: downloadList; headerRef: headerBar }
}
