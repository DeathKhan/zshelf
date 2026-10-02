import QtQuick 2.11
import QtQuick.Controls 2.4
import "Theme.js" as Theme

Item {
    id: settingsUI
    objectName: "settingsScreen"
    property variant storeFront
    visible: false

    function openSettings(open) {
        visible = open
        statusText.text = ""
        if (open && storeFront) {
            urlInput.text = storeFront.sourceUrl
            dirInput.text = storeFront.downloadDir
            urlInput.forceActiveFocus()
        }
        if (typeof panel !== "undefined") panel.flash()
    }

    function save() {
        if (!storeFront) return
        var ok = storeFront.saveLibrarySettings(urlInput.text, dirInput.text)
        if (ok) {
            urlInput.text = storeFront.sourceUrl
            dirInput.text = storeFront.downloadDir
            statusText.text = "Saved"
        } else {
            statusText.text = "Could not save. Use a full http or https URL."
        }
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colorSurface
        MouseArea { anchors.fill: parent }
    }

    Text {
        id: heading
        text: "Settings"
        font.family: Theme.fontFamily
        font.bold: true
        font.pixelSize: Theme.fontSizeTitle
        color: Theme.colorText
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.margins: Theme.margin
    }

    Text {
        id: urlLabel
        text: "Z-Library source URL"
        font.family: Theme.fontFamilyContent
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.colorText
        anchors.left: parent.left
        anchors.top: heading.bottom
        anchors.margins: Theme.margin
        anchors.topMargin: 16
    }

    Rectangle {
        id: urlBox
        color: Theme.colorPrimary
        height: 90
        anchors {
            left: parent.left
            right: parent.right
            top: urlLabel.bottom
            leftMargin: Theme.margin
            rightMargin: Theme.margin
            topMargin: 8
        }
        TextField {
            id: urlInput
            objectName: "sourceUrlInput"
            anchors.fill: parent
            anchors.leftMargin: 20
            anchors.rightMargin: 20
            font.pixelSize: Theme.fontSizeBody
            font.family: Theme.fontFamilyContent
            color: Theme.colorTextInverse
            placeholderText: "https://zlib.bz"
            placeholderTextColor: "#cccccc"
            inputMethodHints: Qt.ImhUrlCharactersOnly
            verticalAlignment: Text.AlignVCenter
            background: Rectangle { color: Theme.colorPrimary }
            onActiveFocusChanged: if (activeFocus) keyboard.target = urlInput
        }
    }

    Text {
        id: dirLabel
        text: "Download folder"
        font.family: Theme.fontFamilyContent
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.colorText
        anchors.left: parent.left
        anchors.top: urlBox.bottom
        anchors.leftMargin: Theme.margin
        anchors.topMargin: 16
    }

    Rectangle {
        id: dirBox
        color: Theme.colorPrimary
        height: 90
        anchors {
            left: parent.left
            right: parent.right
            top: dirLabel.bottom
            leftMargin: Theme.margin
            rightMargin: Theme.margin
            topMargin: 8
        }
        TextField {
            id: dirInput
            objectName: "downloadDirInput"
            anchors.fill: parent
            anchors.leftMargin: 20
            anchors.rightMargin: 20
            font.pixelSize: Theme.fontSizeBody
            font.family: Theme.fontFamilyContent
            color: Theme.colorTextInverse
            placeholderText: "/home/root/Books"
            placeholderTextColor: "#cccccc"
            verticalAlignment: Text.AlignVCenter
            background: Rectangle { color: Theme.colorPrimary }
            onActiveFocusChanged: if (activeFocus) keyboard.target = dirInput
        }
    }

    Text {
        id: statusText
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: dirBox.bottom
        anchors.margins: Theme.margin
        font.family: Theme.fontFamilyContent
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.colorText
        wrapMode: Text.WordWrap
    }

    Rectangle {
        id: saveButton
        width: 220
        height: Math.max(Theme.minTouchSize, 70)
        radius: Theme.radiusCard
        color: Theme.colorPrimary
        anchors {
            left: parent.left
            top: statusText.bottom
            leftMargin: Theme.margin
            topMargin: 10
        }
        Text {
            text: "Save"
            color: Theme.colorTextInverse
            font.family: Theme.fontFamily
            font.styleName: "Bold"
            font.pixelSize: Theme.fontSizeBody
            anchors.centerIn: parent
        }
        MouseArea { anchors.fill: parent; onClicked: save() }
    }

    Rectangle {
        width: 160
        height: Math.max(Theme.minTouchSize, 70)
        radius: Theme.radiusCard
        color: Theme.colorSurface
        border.color: Theme.colorPrimary
        border.width: Theme.borderWidth
        anchors {
            left: saveButton.right
            top: saveButton.top
            leftMargin: 20
        }
        Text {
            text: "Close"
            color: Theme.colorText
            font.family: Theme.fontFamily
            font.styleName: "Bold"
            font.pixelSize: Theme.fontSizeBody
            anchors.centerIn: parent
        }
        MouseArea { anchors.fill: parent; onClicked: settingsUI.openSettings(false) }
    }

    SearchKeyboard {
        id: keyboard
        objectName: "settingsKeyboard"
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        height: Math.min(520, parent.height * 0.36)
        target: urlInput
        actionText: "Save"
        onSubmitted: save()
    }
}
