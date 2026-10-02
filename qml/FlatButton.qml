import QtQuick 2.11
import QtQuick.Controls 2.4
import "Theme.js" as Theme

Item {
    id: root
    signal tapped
    property color bgColor: Theme.colorSurface
    property color fgColor: Theme.colorText
    property alias text: label.text
    property int borderWidth: Theme.borderWidth
    implicitWidth: Math.max(100, label.implicitWidth + 40)
    implicitHeight: 80
    opacity: enabled ? 1 : 0.45
    activeFocusOnTab: true
    Keys.onReturnPressed: if (enabled) tapped()
    Keys.onSpacePressed: if (enabled) tapped()

    Rectangle {
        anchors.fill: parent
        color: touch.pressed ? root.fgColor : root.bgColor
        radius: Theme.radiusCard
        border.color: root.fgColor
        border.width: root.activeFocus ? Math.max(3, root.borderWidth) : root.borderWidth
    }
    Text {
        id: label
        anchors.fill: parent
        anchors.margins: 10
        color: touch.pressed ? root.bgColor : root.fgColor
        horizontalAlignment: Text.AlignHCenter
        verticalAlignment: Text.AlignVCenter
        elide: Text.ElideRight
        font.family: Theme.fontFamily
        font.bold: true
        font.pixelSize: Theme.fontSizeBody
    }
    MouseArea {
        id: touch
        anchors.fill: parent
        onClicked: root.tapped()
    }
}
