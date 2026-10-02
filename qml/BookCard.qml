import QtQuick 2.11
import QtQuick.Controls 2.4
import "Theme.js" as Theme

Item {
    id: root
    objectName: "bookCard"
    property var book
    property var pressedBook: null
    property bool showDownloadStatus: true
    property real cardMargin: 10
    /// Explicit content width so image is correct before delegate width is applied (fixes tiny thumbnails on first paint)
    property real contentWidth: -1
    readonly property real effectiveWidth: contentWidth > 0 ? contentWidth : root.width
    // tappedBook is the book under the press, identified later by URL.
    signal clicked(var tappedBook)



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
        anchors.bottom: fileInfo.top
        anchors.bottomMargin: 0
        anchors.horizontalCenter: parent.horizontalCenter
        horizontalAlignment: Text.AlignHCenter
        height: 36
        elide: Text.ElideRight
        maximumLineCount: 1
        wrapMode: Text.Wrap
    }

    Text {
        id: fileInfo
        text: root.book && root.book.fileSize ? (root.book.fileExt.toUpperCase() + " • " + root.book.fileSize) : ""
        font.family: Theme.fontFamilyContent
        font.pixelSize: Theme.fontSizeBody - 4
        color: Theme.colorMuted || "#666666"
        width: Math.max(0, root.effectiveWidth - root.cardMargin * 2)
        anchors.bottom: parent.bottom
        anchors.bottomMargin: 5
        anchors.horizontalCenter: parent.horizontalCenter
        horizontalAlignment: Text.AlignHCenter
        height: 20
        elide: Text.ElideRight
        maximumLineCount: 1
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
        height: 72
        elide: Text.ElideRight
        maximumLineCount: 2
        wrapMode: Text.Wrap
    }

    Image {
        id: cover
        visible: !!root.book
        anchors { top: parent.top; bottom: name.top; horizontalCenter: parent.horizontalCenter; topMargin: 12; bottomMargin: 16 }
        width: Math.max(0, root.effectiveWidth - root.cardMargin * 2 - 20)
        fillMode: Image.PreserveAspectFit
        asynchronous: true
        sourceSize: Qt.size(Math.round(width), Math.round(height))
        source: root.book && root.book.imgFile ? root.book.imgFile : ""
        onStatusChanged: if (status === Image.Ready && typeof panel !== "undefined") { panel.markGray(); panel.bump() }
        Rectangle {
            anchors.centerIn: parent
            width: Math.min(parent.width, parent.height / 1.5)
            height: parent.height
            color: "#f4f4f4"
            border.color: "#aaaaaa"
            border.width: 1
            visible: cover.status === Image.Error || cover.status === Image.Null
            Text {
                anchors.centerIn: parent
                text: "No cover"
                font.family: Theme.fontFamily
                font.pixelSize: Theme.fontSizeSmall
                color: Theme.colorMuted
            }
        }
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

    Rectangle {
        objectName: "checkingSlot"
        visible: !root.book
        anchors.fill: parent
        anchors.margins: 14
        color: Theme.colorSurface
        border.color: "#dddddd"
        Text {
            anchors.centerIn: parent
            text: "Checking…"
            color: Theme.colorMuted
            font.family: Theme.fontFamily
            font.pixelSize: Theme.fontSizeBody
        }
    }

    MouseArea {
        anchors.fill: root
        enabled: root.book !== null && root.book !== undefined
        onPressed: root.pressedBook = root.book
        onCanceled: root.pressedBook = null
        onClicked: { if (root.pressedBook && root.pressedBook === root.book) root.clicked(root.pressedBook); root.pressedBook = null }
    }
}
