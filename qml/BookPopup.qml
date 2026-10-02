import QtQuick 2.11
import QtQuick.Controls 2.4
import QtQuick.Layouts 1.11
import "Theme.js" as Theme

Popup {
    property var model: null
    readonly property bool isBusy: model ? model.detailBusy : false
    readonly property string detailError: model ? model.detailError : ""
    objectName: "bookPopup"

    id: bookPopup

    width: parent ? Math.min(parent.width * 0.9, 1000) : 1000
    height: parent ? Math.min(parent.height * 0.9, 1300) : 1300
    x: parent ? (parent.width - width) / 2 : 0
    y: parent ? (parent.height - height) / 2 : 0
    modal: true
    closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
    dim: true
    padding: Theme.popupPadding

    Overlay.modeless: Rectangle {
        color: "#90ffffff"
        MouseArea {
            anchors.fill: parent
        }
    }

    background: Rectangle {
        border.width: Theme.borderWidth
        border.color: Theme.colorPrimary
        radius: Theme.radiusCard + 2
    }

    function showBook(selectedBook) {
        if (!selectedBook) return
        // Identity is the book URL, not the title. Several results share a title.
        var url = selectedBook.url ? String(selectedBook.url) : ""
        var match = selectedBook
        var list = (typeof store !== "undefined" && store && store.books) ? store.books : []
        if (url.length) {
            for (var i = 0; i < list.length; i++) {
                var candidate = list[i]
                if (candidate && String(candidate.url) === url) {
                    match = candidate
                    break
                }
            }
        }
        model = match
        match.getDetail()
        open()
    }

    onOpened: { bar.currentIndex = 0; descriptionView.contentY = 0; if (typeof panel !== "undefined") panel.flash() }
    onClosed: if (typeof panel !== "undefined") panel.flash()
    onModelChanged: { bar.currentIndex = 0; descriptionView.contentY = 0 }

    contentChildren: [
        Image {
            id: bookImage
            fillMode: Image.PreserveAspectFit
            smooth: true
            source: model ? model.imgFile : ""
            width: Math.min(320, parent.width * 0.4)
            height: Math.min(420, parent.height * 0.36)
            sourceSize: Qt.size(400, 600)
            onStatusChanged: if (status === Image.Ready && typeof panel !== "undefined") { panel.markGray(); panel.bump() }
            anchors.horizontalCenter: parent.horizontalCenter
            anchors.top: parent.top
            ProgressBar {
                visible: parent.status === Image.Loading
                value: parent.progress
                anchors {
                    horizontalCenter: parent.horizontalCenter
                    bottom: parent.bottom
                    bottomMargin: 80
                }
            }
        },
        Text {
            id: bookName
            text: model ? model.name : ""
            anchors {
                left: parent.left; right: parent.right
                top: bookImage.bottom
                topMargin: 30
            }
            font.family: Theme.fontFamilyContent
            font.bold: true
            font.pixelSize: Theme.fontSizeTitle
            wrapMode: Text.Wrap
            maximumLineCount: 2
            elide: Text.ElideRight
            horizontalAlignment: Text.AlignHCenter
        },
        Text {
            id: bookAuthor
            text: model ? model.author : ""
            anchors {
                left: parent.left; right: parent.right
                top: bookName.bottom
                topMargin: 20
            }
            font.family: Theme.fontFamilyContent
            font.pixelSize: Theme.fontSizeBody + 10
            wrapMode: Text.Wrap
            maximumLineCount: 2
            elide: Text.ElideRight
            horizontalAlignment: Text.AlignHCenter
        },
        TabBar {
            id: bar
            objectName: "detailTabs"
            visible: !isBusy
            anchors {
                left: parent.left; right: parent.right
                top: bookAuthor.bottom
                topMargin: 30
            }
            font.pixelSize: Theme.fontSizeBody
            TabButton {
                contentItem: Label {
                    text: "Details"
                    color: bar.currentIndex == 0 ? Theme.colorPrimary : Theme.colorMuted
                    font.underline: bar.currentIndex == 0
                    horizontalAlignment: Text.AlignHCenter
                }
                background: Rectangle {}
            }
            TabButton {
                contentItem: Label {
                    text: "Similar books"
                    color: bar.currentIndex == 1 ? Theme.colorPrimary : Theme.colorMuted
                    font.underline: bar.currentIndex == 1
                    horizontalAlignment: Text.AlignHCenter
                }
                background: Rectangle {}
            }
        },
        StackLayout {
            id: stack
            visible: !bookPopup.isBusy && !bookPopup.detailError.length
            anchors {
                left: parent.left; right: parent.right
                top: bar.bottom
                topMargin: 30
                bottom: download.top
                bottomMargin: 20
            }
            currentIndex: bar.currentIndex
            Item {
                Flickable {
                    id: descriptionView
                    objectName: "bookDescription"
                    anchors.fill: parent
                    contentHeight: bookDesc.height
                    clip: true
                    flickableDirection: Flickable.VerticalFlick
                    boundsBehavior: Flickable.StopAtBounds

                    Text {
                        id: bookDesc
                        textFormat: Text.RichText
                        text: model ? model.desc : ""
                        font.family: Theme.fontFamilyContent
                        font.pixelSize: Theme.fontSizeBody + 5
                        width: parent.width
                        wrapMode: Text.Wrap
                    }
                }
            }
            Item {
                GridView {
                    id: recGrid
                    anchors.fill: parent
                    boundsBehavior: Flickable.StopAtBounds
                    cellHeight: height
                    cellWidth: width / 3
                    model: bookPopup.model ? bookPopup.model.similars : []
                    flickableDirection: Flickable.HorizontalFlick
                    flow: GridView.TopToBottom
                    clip: true
                    snapMode: GridView.SnapToRow
                    flickDeceleration: 0
                    delegate: BookCard {
                        width: recGrid.cellWidth
                        height: recGrid.cellHeight
                        book: model.modelData
                        showDownloadStatus: false
                        onClicked: bookPopup.showBook(tappedBook)
                    }
                }
            }
        },
        ColumnLayout {
            anchors.centerIn: stack
            width: stack.width
            visible: bookPopup.isBusy || bookPopup.detailError.length > 0
            spacing: 24
            Text {
                Layout.fillWidth: true
                text: bookPopup.isBusy ? "Loading book details…" : bookPopup.detailError
                wrapMode: Text.Wrap
                horizontalAlignment: Text.AlignHCenter
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSizeBody
            }
            FlatButton {
                objectName: "retryDetails"
                Layout.alignment: Qt.AlignHCenter
                text: "Retry"
                visible: !bookPopup.isBusy
                onTapped: bookPopup.model.getDetail()
            }
        }
    ]

    FlatButton {
        objectName: "closeDetails"
        text: "Close"
        anchors.left: parent.left
        anchors.bottom: parent.bottom
        onTapped: bookPopup.close()
    }

    Text {
        anchors.left: parent.left; anchors.right: parent.right
        anchors.bottom: download.top; anchors.bottomMargin: 12
        text: model ? model.downloadError : ""
        visible: text.length > 0
        wrapMode: Text.Wrap
        font.pixelSize: Theme.fontSizeSmall
    }
    FlatButton {
        id: download
        objectName: "downloadBook"
        enabled: !store.downloadLimitReached && model && model.dlUrl && (model.status === "Download" || model.status === "Retry") && !bookPopup.detailError.length
        visible: !isBusy
        width: 300
        height: Math.max(Theme.minTouchSize, 80)
        anchors.right: parent.right
        anchors.bottom: parent.bottom
        bgColor: Theme.colorPrimary
        fgColor: Theme.colorTextInverse
        text: !model || !model.dlUrl ? "Unavailable" : store.downloadLimitReached && (model.status === "Download" || model.status === "Retry") ? "Daily limit reached" : model.status
        onTextChanged: if (typeof panel !== "undefined") panel.bump()
        onTapped: {
            if(!model || !model.dlUrl || (model.status !== "Download" && model.status !== "Retry")) {
                return
            }
            if (typeof panel !== "undefined") panel.bump()
            store.download(model);
        }
    }
}