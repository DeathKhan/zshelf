import QtQuick 2.11
import QtQuick.Controls 2.4
import "Theme.js" as Theme

Item {
    id: root
    property var book
    property bool showDownloadStatus: true
    property real cardMargin: 10
    /// Explicit content width so image is correct before delegate width is applied (fixes tiny thumbnails on first paint)
    property real contentWidth: -1
    readonly property real effectiveWidth: contentWidth > 0 ? contentWidth : root.width
    signal clicked

    Accessible.role: Accessible.ListItem
    Accessible.name: book ? (book.name + " by " + book.author) : ""


    Rectangle {
        id: background
        color: Theme.colorSurface
        anchors.fill: parent
    }

    Text {
        id: author
        text: root.book ? root.book.author : ""
        font.family: Theme.fontFamilyContent
        font.pixelSize: Theme.fontSizeBody
        width: Math.max(0, root.effectiveWidth - root.cardMargin * 2)
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 50
        anchors.horizontalCenter: parent.horizontalCenter
        horizontalAlignment: Text.AlignHCenter
        maximumLineCount: 1
        wrapMode: Text.Wrap
    }

    Text {
        id: name
        text: root.book ? root.book.name : ""
        font.family: Theme.fontFamilyContent
        font.bold: true
        font.pixelSize: Theme.fontSizeBody
        width: Math.max(0, root.effectiveWidth - root.cardMargin * 2)
        anchors.horizontalCenter: parent.horizontalCenter
        anchors.bottom: author.top
        anchors.bottomMargin: 5
        horizontalAlignment: Text.AlignHCenter
        maximumLineCount: 2
        wrapMode: Text.Wrap
    }

    Loader {
        id: imageLoader
        active: root.width > 100
        anchors.centerIn: parent
        anchors.verticalCenterOffset: -60
        width: active ? (Math.max(Theme.minTouchSize * 2, root.effectiveWidth - root.cardMargin * 2)) : 0
        height: active ? (width * 1.5) : 0
        sourceComponent: Component {
            Image {
                id: image
                fillMode: Image.PreserveAspectCrop
                width: imageLoader.width
                height: imageLoader.height
                sourceSize: Qt.size(width, height)
                source: root.book && root.book.imgFile ? root.book.imgFile : "png/book"
                Image {
                    visible: image.status === Image.Error
                    source: "png/book"
                    width: 52
                    height: 52
                    anchors.centerIn: parent
                }
            }
        }
    }
    Image {
        id: placeholderImage
        visible: !imageLoader.active
        fillMode: Image.PreserveAspectFit
        width: Math.max(Theme.minTouchSize * 2, root.effectiveWidth - root.cardMargin * 2)
        height: width * 1.5
        source: "png/book"
        anchors.centerIn: parent
        anchors.verticalCenterOffset: -60
    }

    Rectangle {
        id: downloadStatus
        visible: root.showDownloadStatus && root.book && (root.book.status === "Downloaded" || (typeof root.book.status === "string" && root.book.status.endsWith("%")))
        anchors.top: parent.top
        anchors.right: parent.right
        width: Math.max(Theme.minTouchSize, downloadStatusText.contentWidth + 20)
        height: Theme.minTouchSize
        color: Theme.colorPrimary

        Text {
            id: downloadStatusText
            text: root.book && root.book.status === "Downloaded" ? "↓" : (root.book ? root.book.status : "")
            color: Theme.colorTextInverse
            anchors.centerIn: parent
            anchors.verticalCenterOffset: 2
            horizontalAlignment: Text.AlignHCenter
            verticalAlignment: Text.AlignVCenter
            font.family: Theme.fontFamily
            font.styleName: "Medium"
            font.pixelSize: Theme.fontSizeBody
        }
    }

    MouseArea {
        anchors.fill: root
        onPressed: {
            background.color = Theme.colorPrimary
            name.color = Theme.colorTextInverse
            author.color = Theme.colorTextInverse
        }
        onReleased: {
            background.color = Theme.colorSurface
            name.color = Theme.colorText
            author.color = Theme.colorText
        }
        onCanceled: {
            background.color = Theme.colorSurface
            name.color = Theme.colorText
            author.color = Theme.colorText
        }
        onClicked: root.clicked()
    }
}
