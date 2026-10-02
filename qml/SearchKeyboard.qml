import QtQuick 2.11
import QtQuick.Controls 2.4
import QtQuick.Layouts 1.11
import "Theme.js" as Theme

Rectangle {
    id: keyboard
    property var target: null
    property string actionText: "Search"
    property string mode: "letters"
    // 0 = lowercase, 1 = one uppercase character, 2 = caps lock.
    property int shiftState: 0
    signal submitted
    color: Theme.colorSurface
    implicitHeight: 500
    border.color: Theme.colorPrimary
    border.width: Theme.borderWidth
    enabled: target !== null
    readonly property var letterRows: ["qwertyuiop".split(""), "asdfghjkl".split(""), ["shift", "z", "x", "c", "v", "b", "n", "m", "backspace"]]
    readonly property var numberRows: ["1234567890".split(""), ["@", "#", "$", "%", "&", "-", "+", "(", ")", "/"], ["symbols", ".", ",", "?", "!", "'", "\"", ":", "backspace"]]
    readonly property var symbolRows: [["[", "]", "{", "}", "<", ">", "=", "_", "\\", "|"], ["~", "`", "^", "*", "€", "£", "¥", "•", ";", ":"], ["numbers", ".", ",", "?", "!", "'", "\"", "—", "backspace"]]
    readonly property var accents: ({a:"àáâãäåæāą", c:"çćč", d:"ďđ", e:"èéêëēėęě", g:"ğģ", i:"ìíîïīį", l:"łľ", n:"ñńň", o:"òóôõöøœō", r:"řŕ", s:"śšşß", t:"ťţ", u:"ùúûüūůű", y:"ýÿ", z:"źżž"})

    function reset() { mode = "letters"; shiftState = 0; alternatives.close() }
    onVisibleChanged: if (!visible) reset()
    onTargetChanged: reset()

    function insertText(value) {
        if (!target) return
        target.forceActiveFocus()
        var start = target.selectionStart
        var end = target.selectionEnd
        if (start !== end) target.remove(start, end)
        var cursor = target.cursorPosition
        target.insert(cursor, value)
        target.cursorPosition = cursor + value.length
        if (shiftState === 1) shiftState = 0
        if (typeof panel !== "undefined") panel.bump()
    }

    function backspace() {
        if (!target) return
        target.forceActiveFocus()
        if (target.selectionStart !== target.selectionEnd) {
            target.remove(target.selectionStart, target.selectionEnd)
        } else {
            var end = target.cursorPosition
            if (!end) return
            // Keep UTF-16 surrogate pairs together (e.g. a pasted emoji).
            var start = end - 1
            var code = target.text.charCodeAt(start)
            if (code >= 0xdc00 && code <= 0xdfff && start > 0) start--
            target.remove(start, end)
        }
        if (typeof panel !== "undefined") panel.bump()
    }

    function activate(key) {
        if (key === "shift") {
            shiftState = (shiftState + 1) % 3
            if (typeof panel !== "undefined") panel.bump()
        }
        else if (key === "symbols") {
            mode = "symbols"
            if (typeof panel !== "undefined") panel.bump()
        }
        else if (key === "numbers") {
            mode = "numbers"
            if (typeof panel !== "undefined") panel.bump()
        }
        else {
            insertText(mode === "letters" && shiftState ? key.toUpperCase() : key)
        }
    }

    function keyLabel(key) {
        if (key === "shift") return shiftState === 2 ? "CAPS" : "Shift"
        if (key === "backspace") return "Delete"
        if (key === "symbols") return "#+="
        if (key === "numbers") return "123"
        return mode === "letters" && shiftState ? key.toUpperCase() : key
    }

    readonly property real keyHeight: (height - 68) / 4

    Column {
        anchors.fill: parent
        anchors.margins: 16
        spacing: 12
        Repeater {
            model: keyboard.mode === "letters" ? keyboard.letterRows : keyboard.mode === "numbers" ? keyboard.numberRows : keyboard.symbolRows
            RowLayout {
                id: keyRow
                property var keys: modelData
                width: parent.width
                height: keyboard.keyHeight
                spacing: 10
                Repeater {
                    model: keyRow.keys
                    Rectangle {
                        id: keyButton
                        property string key: modelData
                        property bool held: false
                        objectName: "key-" + key
                        Layout.fillWidth: true
                        Layout.fillHeight: true
                        Layout.preferredWidth: key.length > 1 ? 150 : 100
                        color: (hit.pressed || (key === "shift" && keyboard.shiftState)) ? Theme.colorPrimary : Theme.colorSurface
                        border.width: Theme.borderWidth
                        border.color: Theme.colorPrimary
                        radius: Theme.radiusCard
                        Text {
                            anchors.centerIn: parent
                            text: keyboard.keyLabel(keyButton.key)
                            color: (hit.pressed || (keyButton.key === "shift" && keyboard.shiftState)) ? Theme.colorTextInverse : Theme.colorText
                            font.family: Theme.fontFamily
                            font.bold: (keyButton.key === "shift" && keyboard.shiftState)
                            font.pixelSize: keyButton.key.length > 1 ? 24 : 32
                        }
                        MouseArea {
                            id: hit
                            anchors.fill: parent
                            onPressed: {
                                keyButton.held = false
                                if (keyButton.key === "backspace") {
                                    keyboard.backspace()
                                }
                            }
                            onPressAndHold: {
                                if (keyButton.key === "backspace") {
                                    repeatDelete.start()
                                } else if (keyboard.mode === "letters" && keyboard.accents[keyButton.key]) {
                                    keyButton.held = true
                                    var chars = keyboard.accents[keyButton.key]
                                    alternatives.characters = (keyboard.shiftState ? chars.toUpperCase() : chars).split("")
                                    alternatives.open()
                                }
                            }
                            onReleased: repeatDelete.stop()
                            onCanceled: repeatDelete.stop()
                            onClicked: {
                                if (!keyButton.held && keyButton.key !== "backspace") {
                                    keyboard.activate(keyButton.key)
                                }
                            }
                        }
                        Timer {
                            id: repeatDelete
                            interval: 90
                            repeat: true
                            onTriggered: keyboard.backspace()
                        }
                        onVisibleChanged: if (!visible) repeatDelete.stop()
                    }
                }
            }
        }
        RowLayout {
            width: parent.width
            height: keyboard.keyHeight
            spacing: 10
            FlatButton {
                objectName: "key-mode"
                Layout.fillHeight: true
                text: keyboard.mode === "letters" ? "123" : "ABC"
                onTapped: { keyboard.mode = keyboard.mode === "letters" ? "numbers" : "letters"; keyboard.target.forceActiveFocus() }
            }
            FlatButton { objectName: "key-at"; Layout.fillHeight: true; text: "@"; onTapped: keyboard.insertText("@") }
            FlatButton {
                objectName: "key-space"
                Layout.fillWidth: true
                Layout.fillHeight: true
                text: "Space"
                onTapped: keyboard.insertText(" ")
            }
            FlatButton { objectName: "key-dot"; Layout.fillHeight: true; text: "."; onTapped: keyboard.insertText(".") }
            FlatButton {
                objectName: "key-submit"
                Layout.fillHeight: true
                text: keyboard.actionText
                bgColor: Theme.colorPrimary
                fgColor: Theme.colorTextInverse
                onTapped: keyboard.submitted()
            }
        }
    }

    Popup {
        id: alternatives
        property var characters: []
        parent: keyboard
        x: 16
        y: -height - 12
        width: keyboard.width - 32
        height: 110
        modal: true
        focus: false
        closePolicy: Popup.CloseOnEscape | Popup.CloseOnPressOutside
        background: Rectangle { color: Theme.colorSurface; border.color: Theme.colorPrimary; border.width: 2 }
        contentItem: RowLayout {
            spacing: 8
            Repeater {
                model: alternatives.characters
                FlatButton {
                    objectName: "accent-" + modelData
                    Layout.fillWidth: true
                    Layout.fillHeight: true
                    text: modelData
                    onTapped: { keyboard.insertText(modelData); alternatives.close() }
                }
            }
            FlatButton { text: "Close"; onTapped: alternatives.close() }
        }
    }
}
