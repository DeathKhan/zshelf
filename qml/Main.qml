import QtQuick 2.11
import QtQuick.Controls 2.4
import QtQuick.Layouts 1.11
import "Theme.js" as Theme

Rectangle {
    id: canvas
    width: screenGeometry.width
    height: screenGeometry.height
    readonly property int screenMargin: Theme.margin
    readonly property int columns: Theme.columns
    readonly property int rows: Theme.rows
    readonly property int itemPerPage: rows * columns
    // Fallback when width not yet set (e.g. before first layout) so thumbnails aren't tiny
    readonly property int bookWidth: width > 100 ? (width - screenMargin * 2) / columns : 331
    readonly property int itemContentWidth: bookWidth - Theme.marginSmall

    Rectangle {
        id: title
        visible: titleVisible
        z: 3
        anchors.fill: parent
        color: "white"
        Image {
            id: titleImg
            source: "svg/title"
            anchors.centerIn: parent
        }
    }

    Rectangle {
        id: closeApp
        anchors.top: parent.top
        anchors.right: parent.right
        anchors.margins: screenMargin
        width: Math.max(Theme.minTouchSize, 80)
        height: Math.max(Theme.minTouchSize, 80)
        radius: Theme.radiusButton
        z: 1
        color: Theme.colorPrimary
        Accessible.name: "Close"
        Text {
            text: "x"
            font.family: Theme.fontFamily
            font.bold: true
            font.pixelSize: Theme.fontSizeTitle
            color: Theme.colorTextInverse
            anchors.centerIn: parent
            anchors.topMargin: 10
        }
        MouseArea {
            anchors.fill: parent
            onClicked: Qt.quit()
        }
    }


    Rectangle {
        id: headerBar
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: parent.top
        anchors.margins: Theme.margin
        height: Theme.headerHeight

        Rectangle {
            width: 150
            height: 80

            Image {
                source: "png/searchblack"
                width: 80
                height: 80
            }
            MouseArea {
                anchors.fill: parent
                onClicked: queryUI.openSearch(true);
            }
        }
        Rectangle {
            id: savedList
            width: Math.max(Theme.minTouchSize, 60)
            height: Math.max(Theme.minTouchSize, 60)
            border.color: Theme.colorPrimary
            border.width: Theme.borderWidth
            radius: Theme.radiusButton
            color: Theme.colorSurface
            Accessible.name: "Saved books"
            anchors {
                right: parent.right
                rightMargin: 120
                top: parent.top
                topMargin: 10
            }
            Image {
                source: "png/bookmark"
                anchors.centerIn: parent
            }
            MouseArea {
                anchors.fill: parent
                onClicked: store.openSavedList(0)
            }
        }
        Rectangle {
            id: signInButton
            width: Math.max(Theme.minTouchSize * 2, 140)
            height: Math.max(Theme.minTouchSize, 60)
            border.color: Theme.colorPrimary
            border.width: Theme.borderWidth
            radius: Theme.radiusButton
            color: Theme.colorSurface
            Accessible.name: "Sign in"
            anchors {
                right: accountStatus.left
                rightMargin: 20
                top: parent.top
                topMargin: 10
            }
            Text {
                text: store.signedIn ? "Account" : "Sign in"
                color: Theme.colorText
                font.pixelSize: Theme.fontSizeSmall
                font.family: Theme.fontFamily
                font.styleName: "Bold"
                anchors.centerIn: parent
            }
            MouseArea {
                anchors.fill: parent
                onClicked: loginUI.openLogin(true)
            }
        }
        Rectangle {
            id: accountStatus
            width: Math.max(Theme.minTouchSize * 2, accountStatusText.contentWidth + 60)
            height: Math.max(Theme.minTouchSize, 60)
            visible: store.accountStatus.length > 0
            border.color: Theme.colorPrimary
            border.width: Theme.borderWidth
            radius: Theme.radiusButton
            color: Theme.colorSurface
            Accessible.name: "Download history"
            anchors {
                right: savedList.left
                rightMargin: 30
                top: parent.top
                topMargin: 10
            }
            Text {
                id: accountStatusText
                text: store.accountStatus
                color: Theme.colorText
                font.pixelSize: Theme.fontSizeBody
                font.family: Theme.fontFamily
                font.styleName: "Medium"
                anchors.centerIn: parent
                anchors.verticalCenterOffset: 2
            }
            MouseArea {
                anchors.fill: parent
                onClicked: {
                    if (store.signedIn)
                        downloadList.open()
                    else
                        loginUI.openLogin(true)
                }
            }
        }
    }

    GridView {
        id: libView
        objectName: "libView"
        anchors.fill: parent
        anchors.margins: screenMargin
        anchors.top: headerBar.bottom
        anchors.topMargin: Theme.marginSmall

        boundsBehavior: Flickable.StopAtBounds
        cellWidth: bookWidth
        cellHeight: bookWidth * 1.5 + 30
        model: store.books
        flickableDirection: Flickable.HorizontalFlick
        flow: GridView.TopToBottom
        clip: true
        snapMode: GridView.SnapToRow
        flickDeceleration: 0
        onMovementEnded: currentIndex = indexAt(contentX, 0)

        delegate: BookCard {
            width: libView.cellWidth
            height: libView.cellHeight
            contentWidth: libView.cellWidth
            book: model.modelData
            showDownloadStatus: true
            onClicked: {
                model.modelData.getDetail(itemInfo);
                itemInfo.model = model.modelData;
                itemInfo.open();
            }
        }
    }

    Rectangle {
        id: emptyState
        visible: !store.isBusy && store.books.length === 0 && (!storeError || storeError.length === 0)
        z: 1
        anchors.fill: libView
        color: Theme.colorSurface
        Text {
            anchors.centerIn: parent
            text: "No books yet.\nTap search to start."
            font.family: Theme.fontFamilyContent
            font.pixelSize: Theme.fontSizeTitle
            color: Theme.colorMuted
            horizontalAlignment: Text.AlignHCenter
        }
    }

    Row {
        anchors.bottom: parent.bottom
        anchors.left: parent.left
        anchors.leftMargin: screenMargin
        anchors.bottomMargin: screenMargin + 10
        Repeater {
            model: store.pages
            Rectangle {
                width: Math.max(Theme.minTouchSize * 2, 100)
                height: Math.max(Theme.minTouchSize, 60)
                Rectangle {
                    id: bg
                    width: Math.max(Theme.minTouchSize, 80)
                    height: Math.max(Theme.minTouchSize, 60)
                    anchors.centerIn: parent
                    border.width: store.currentPage == index ? Theme.borderWidth : 0
                    border.color: Theme.colorPrimary
                    radius: Theme.radiusButton
                    color: Theme.colorSurface
                }
                Text {
                    text: modelData
                    anchors.centerIn: bg
                    anchors.verticalCenterOffset: 2
                    horizontalAlignment: Text.AlignHCenter
                    verticalAlignment: Text.AlignVCenter
                    font.family: Theme.fontFamily
                    font.styleName: "Medium"
                    font.pixelSize: Theme.fontSizeSmall
                }
                MouseArea {
                    anchors.fill: parent
                    onClicked: {
                        if (store.currentPage == index) {
                            return;
                        }
                        store.newQuery(index);
                    }
                }
            }
        }
    }

    Rectangle {
        property bool isClickable: (libView.currentIndex + itemPerPage) < libView.count
        id: goRight
        anchors.bottom: parent.bottom
        anchors.right: parent.right
        anchors.margins: screenMargin
        width: Math.max(Theme.minTouchSize, 80)
        height: Math.max(Theme.minTouchSize, 80)
        radius: Theme.radiusButton
        color: isClickable ? Theme.colorPrimary : Theme.colorMuted
        Accessible.name: "Next page"
        Text {
            text: "v"
            font.family: Theme.fontFamily
            font.bold: true
            font.pixelSize: Theme.fontSizeTitle
            color: Theme.colorTextInverse
            anchors.centerIn: parent
        }
        transform: Rotation {
            origin.x: goRight.width / 2
            origin.y: goRight.height / 2
            angle: 270
        }
        MouseArea {
            anchors.fill: parent
            onClicked: {
                if (parent.isClickable) {
                    libView.currentIndex += itemPerPage;
                } else {
                    return;
                }

                if (libView.currentIndex >= libView.count) {
                    libView.currentIndex = libView.count - itemPerPage + libView.count % itemPerPage;
                }
                libView.positionViewAtIndex(libView.currentIndex, GridView.Beginning);
            }
        }
    }

    
    Rectangle {
        property bool isClickable: (libView.currentIndex - itemPerPage) >= 0 ||
            (libView.currentIndex - rows) >= 0
        id: goLeft
        anchors.bottom: parent.bottom
        anchors.right: goRight.left
        anchors.margins: screenMargin
        width: Math.max(Theme.minTouchSize, 80)
        height: Math.max(Theme.minTouchSize, 80)
        radius: Theme.radiusButton
        color: isClickable ? Theme.colorPrimary : Theme.colorMuted
        Accessible.name: "Previous page"
        Text {
            text: "v"
            font.family: Theme.fontFamily
            font.bold: true
            font.pixelSize: Theme.fontSizeTitle
            color: Theme.colorTextInverse
            anchors.centerIn: parent
        }
        transform: Rotation {
            origin.x: goLeft.width / 2
            origin.y: goLeft.height / 2
            angle: 90
        }
        MouseArea {
            anchors.fill: parent
            onClicked: {
                if (parent.isClickable) {
                    libView.currentIndex -= itemPerPage;
                } else {
                    return;
                }

                if (libView.currentIndex < 0) {
                    libView.currentIndex = 0
                }
                libView.positionViewAtIndex(libView.currentIndex, GridView.Beginning);
            }
        }
    }

    BookPopup {
        id: itemInfo
        // anchors.fill: parent
    }
    
    Login {
        id: loginUI
        anchors.fill: parent
        z: 4
        storeFront: store
    }

    Connections {
        target: store
        onSignedInChanged: {
            if (!loginPrompted && !store.signedIn) {
                loginPrompted = true
                loginUI.openLogin(true)
            }
        }
    }
    property bool loginPrompted: false

    Query {
        id: queryUI
        anchors.fill: parent
        z: 2
        storeFront: store
    }

    DownloadPopup {
        id: downloadList
        headerRef: headerBar
    }

    Rectangle {
        id: errorOverlay
        visible: storeError.length > 0
        z: 10
        color: Theme.colorSurface
        anchors.fill: parent
        Text {
            id: errorMessage
            text: storeError
            font.family: Theme.fontFamilyContent
            font.pixelSize: Theme.fontSizeTitle
            width: Math.min(800, parent.width - Theme.margin * 2)
            anchors.centerIn: parent
            anchors.verticalCenterOffset: -Theme.minTouchSize * 2
            horizontalAlignment: Text.AlignHCenter
            wrapMode: Text.Wrap
        }
        FlatButton {
            width: 200
            height: Math.max(Theme.minTouchSize, 70)
            bgColor: Theme.colorPrimary
            fgColor: Theme.colorTextInverse
            text: "Retry"
            anchors.centerIn: parent
            anchors.verticalCenterOffset: Theme.minTouchSize * 2
            onTapped: store.retryQuery()
        }
    }

    Rectangle {
        z: 4
        visible: store.isBusy
        color: Theme.colorSurface
        width: 400
        height: 200
        anchors.centerIn: parent
        anchors.verticalCenterOffset: 160

        Rectangle {
            id: progBarBase
            color: Theme.colorPrimary
            width: 344
            height: 2
            anchors.top: parent.top
            anchors.topMargin: 60
            anchors.horizontalCenter: parent.horizontalCenter
        }

        Rectangle {
            color: Theme.colorPrimary
            width: storeProg * 344
            height: 15
            anchors.bottom: progBarBase.bottom
            anchors.left: progBarBase.left
        }

        onVisibleChanged: {
            if (!visible && queryUI.visible) {
                queryUI.visible = false;
            }
        }

        Rectangle {
            id: cancleButton
            visible: !titleVisible
            color: Theme.colorPrimary
            width: 200
            height: Math.max(Theme.minTouchSize, 70)
            radius: Theme.radiusCard
            anchors {
                bottom: parent.bottom
                bottomMargin: 30
                horizontalCenter: parent.horizontalCenter
            }
            Accessible.name: "Cancel"
            Text {
                text: "Cancel"
                color: Theme.colorTextInverse
                anchors.fill: parent
                anchors.centerIn: parent
                horizontalAlignment: Text.AlignHCenter
                verticalAlignment: Text.AlignVCenter
                font.family: Theme.fontFamily
                font.styleName: "Bold"
                font.pixelSize: Theme.fontSizeBody
            }
            MouseArea {
                anchors.fill: parent
                onClicked: store.stopQuery()
            }
        }
    }
}
