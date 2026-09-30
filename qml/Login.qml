import QtQuick 2.11
import QtQuick.Controls 2.4
import QuickKeyboard 1.0
import "modes"
import "Theme.js" as Theme

Item {
    id: loginUI
    property variant storeFront
    visible: false

    function openLogin(open) {
        visible = open
        statusText.text = ""
        if (open)
            keyboard.dispatcher.setFocusObject(emailInput)
    }

    function submit() {
        statusText.text = "Signing in..."
        storeFront.signIn(emailInput.text, passwordInput.text)
    }

    Connections {
        target: storeFront
        onLoginFinished: {
            if (ok) {
                passwordInput.text = ""
                statusText.text = "Signed in"
                loginUI.openLogin(false)
            } else {
                passwordInput.text = ""
                statusText.text = message
            }
        }
    }

    Rectangle {
        anchors.fill: parent
        color: Theme.colorSurface
        MouseArea { anchors.fill: parent }
    }

    Text {
        id: heading
        text: "Sign in"
        font.family: Theme.fontFamily
        font.bold: true
        font.pixelSize: Theme.fontSizeTitle
        color: Theme.colorText
        anchors.left: parent.left
        anchors.top: parent.top
        anchors.margins: Theme.margin
    }

    Text {
        id: hint
        text: "Uses your Z-Library account. The password is not saved."
        font.family: Theme.fontFamilyContent
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.colorText
        wrapMode: Text.WordWrap
        width: parent.width - Theme.margin * 2
        anchors.left: parent.left
        anchors.top: heading.bottom
        anchors.margins: Theme.margin
        anchors.topMargin: 10
    }

    Rectangle {
        id: emailBox
        color: Theme.colorPrimary
        height: 90
        anchors {
            left: parent.left
            right: parent.right
            top: hint.bottom
            margins: Theme.margin
            topMargin: 20
        }
        TextField {
            id: emailInput
            anchors.fill: parent
            anchors.leftMargin: 20
            anchors.rightMargin: 20
            font.pixelSize: Theme.fontSizeBody
            font.family: Theme.fontFamilyContent
            color: Theme.colorTextInverse
            placeholderText: "Email"
            inputMethodHints: Qt.ImhEmailCharactersOnly
            verticalAlignment: Text.AlignVCenter
            background: Rectangle { color: Theme.colorPrimary }
            onActiveFocusChanged: if (activeFocus) keyboard.dispatcher.setFocusObject(emailInput)
            MouseArea {
                anchors.fill: parent
                onClicked: keyboard.dispatcher.setFocusObject(emailInput)
            }
        }
    }

    Rectangle {
        id: passwordBox
        color: Theme.colorPrimary
        height: 90
        anchors {
            left: parent.left
            right: parent.right
            top: emailBox.bottom
            leftMargin: Theme.margin
            rightMargin: Theme.margin
            topMargin: 16
        }
        TextField {
            id: passwordInput
            anchors.fill: parent
            anchors.leftMargin: 20
            anchors.rightMargin: 20
            font.pixelSize: Theme.fontSizeBody
            font.family: Theme.fontFamilyContent
            color: Theme.colorTextInverse
            placeholderText: "Password"
            echoMode: TextInput.Password
            verticalAlignment: Text.AlignVCenter
            background: Rectangle { color: Theme.colorPrimary }
            onActiveFocusChanged: if (activeFocus) keyboard.dispatcher.setFocusObject(passwordInput)
            MouseArea {
                anchors.fill: parent
                onClicked: keyboard.dispatcher.setFocusObject(passwordInput)
            }
        }
    }

    Text {
        id: statusText
        anchors.left: parent.left
        anchors.right: parent.right
        anchors.top: passwordBox.bottom
        anchors.margins: Theme.margin
        font.family: Theme.fontFamilyContent
        font.pixelSize: Theme.fontSizeSmall
        color: Theme.colorText
        wrapMode: Text.WordWrap
    }

    Rectangle {
        id: submitButton
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
        Accessible.name: "Sign in submit"
        Text {
            text: "Sign in"
            color: Theme.colorTextInverse
            font.family: Theme.fontFamily
            font.styleName: "Bold"
            font.pixelSize: Theme.fontSizeBody
            anchors.centerIn: parent
        }
        MouseArea {
            anchors.fill: parent
            onClicked: submit()
        }
    }

    Rectangle {
        width: 160
        height: Math.max(Theme.minTouchSize, 70)
        radius: Theme.radiusCard
        color: Theme.colorSurface
        border.color: Theme.colorPrimary
        border.width: Theme.borderWidth
        anchors {
            left: submitButton.right
            top: submitButton.top
            leftMargin: 20
        }
        Accessible.name: "Close sign in"
        Text {
            text: "Close"
            color: Theme.colorText
            font.family: Theme.fontFamily
            font.styleName: "Bold"
            font.pixelSize: Theme.fontSizeBody
            anchors.centerIn: parent
        }
        MouseArea {
            anchors.fill: parent
            onClicked: {
                passwordInput.text = ""
                loginUI.openLogin(false)
            }
        }
    }

    Keyboard {
        id: keyboard
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        height: 520
        mode: standard
        Standard {
            id: standard
            anchors.fill: parent
            anchors.topMargin: 70
            onSymbolsModeSwitched: keyboard.mode = symbols
            onEnter: submit()
        }
        Symbols {
            id: symbols
            anchors.fill: parent
            anchors.topMargin: 70
            onStandardModeSwitched: keyboard.mode = standard
            onSymbolsModeSwitched: keyboard.mode = symbols2
            onEnter: submit()
        }
        Symbols2 {
            id: symbols2
            anchors.fill: parent
            anchors.topMargin: 70
            onStandardModeSwitched: keyboard.mode = standard
            onSymbolsModeSwitched: keyboard.mode = symbols
            onEnter: submit()
        }
    }
}
