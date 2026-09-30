import QtQuick 2.5
import QtQuick.Controls 2.4
import "Theme.js" as Theme

Item {
    id: root
    signal activated(int index);
    property alias model: combo.model
    property alias text: name.text
    property alias curIndex: combo.currentIndex

    function setDefault(value) {
        const id = combo.find(value, Qt.MatchExactly);
        if (id !== -1) combo.currentIndex = id;
        else combo.currentIndex = 0;
    }

    function reset() {
        combo.currentIndex = 0;
    }

    function value() {
        return combo.currentText;
    }

    height: 100

    Text {
        id: name
        font.pixelSize: Theme.fontSizeBody + 10
        font.family: Theme.fontFamily
        font.styleName: "Bold"
    }
    ComboBox {
        id: combo
        anchors {
            top: name.bottom
            topMargin: Theme.marginSmall
        }
        width: parent.width
        height: Math.max(Theme.minTouchSize, 60)
        font.family: Theme.fontFamily
        font.styleName: "Light"
        Accessible.role: Accessible.ComboBox

        background: Rectangle {
            border.width: Theme.borderWidth
            border.color: Theme.colorPrimary
            color: Theme.colorSurface
            radius: Theme.radiusCard
        }
        contentItem: Label {
            text: parent.currentText
            anchors {
                left: parent.left
                leftMargin: 15
                verticalCenter: parent.verticalCenter
                verticalCenterOffset: 2
            }
            verticalAlignment: Text.AlignVCenter
            color: Theme.colorText
        }

        delegate: ItemDelegate {
            width: root.width - 25
            height: Math.max(Theme.minTouchSize, 60)
            contentItem: Text {
                text: modelData
                color: Theme.colorText
                font.family: Theme.fontFamily
                font.styleName: "Light"
                font.bold: combo.highlightedIndex === index
                verticalAlignment: Text.AlignVCenter
            }
        }

        popup: Popup {
            readonly property int columns: combo.model.length > 12 ? 2 : 1
            y: combo.height + Theme.marginSmall
            width: root.width * columns
            implicitHeight: Math.min(contentItem.contentHeight + 20, 800)
            clip: true

            contentItem: GridView {
                id: grid
                flow: GridView.FlowLeftToRight
                model: combo.popup.visible ? combo.delegateModel : null
                currentIndex: combo.highlightedIndex
                cellWidth: root.width - 15
                cellHeight: combo.height

                ScrollBar.vertical: ScrollBar { policy: ScrollBar.AsNeeded }
            }

            background: Rectangle {
                border.color: Theme.colorPrimary
                border.width: Theme.borderWidth
                radius: Theme.radiusCard
            }
        }

        onActivated: parent.activated(index);
    }
}