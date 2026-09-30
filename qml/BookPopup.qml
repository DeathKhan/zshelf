import QtQuick 2.11
import QtQuick.Controls 2.4
import QtQuick.Layouts 1.11
import "Theme.js" as Theme

Popup {
    property var model;
    property bool isBusy;

    id: bookPopup

    width: parent ? Math.min(parent.width * 0.9, 1000) : 1000
    height: parent ? Math.min(parent.height * 0.9, 1300) : 1300
    x: parent ? (parent.width - width) / 2 : 0
    y: parent ? (parent.height - height) / 2 : 0
    closePolicy: Popup.CloseOnPressOutside
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

    onOpened: bar.currentIndex = 0;

    contentChildren: [
        Image {
            id: bookImage
            fillMode: Image.PreserveAspectFit
            smooth: true
            source: model ? model.imgFile : ""
            width: 400
            height: 400 * 1.5
            sourceSize: Qt.size(400, 600)
            anchors.horizontalCenter: parent.horizontalCenter
            y: -(parent.height / 2 - height / 2)
            ProgressBar {
                visible: parent.progress < 1.0
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
            horizontalAlignment: Text.AlignHCenter
        },
        TabBar {
            id: bar
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
            anchors {
                left: parent.left; right: parent.right
                top: bar.bottom
                topMargin: 30
                bottom: parent.bottom
                bottomMargin: 30
            }
            currentIndex: bar.currentIndex
            Item {
                Flickable {
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
                    cellHeight: stack.height / 2
                    cellWidth: cellHeight / 1.5
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
                        onClicked: {
                            model.modelData.getDetail(bookPopup);
                            bar.currentIndex = 0;
                            bookPopup.model = model.modelData;
                        }
                    }
                }
            }
        },
        Image {
            z: 1
            source: "png/loading"
            visible: isBusy
            width: 60
            height: 60
            anchors.centerIn: parent
        }
    ]

    FlatButton {
        id: download
        visible: !isBusy
        width: 300
        height: Math.max(Theme.minTouchSize, 80)
        x: parent.width - 220
        y: parent.height - 5
        bgColor: Theme.colorPrimary
        fgColor: Theme.colorTextInverse
        text: !model || !model.dlUrl ? "Unavailable" : model.status
        onTapped: {
            if(!model || !model.dlUrl || model.status !== "Download") {
                return
            }
            store.download(model);
        }
    }
}