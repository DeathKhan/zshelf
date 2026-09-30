import QtQuick 2.5
import QtQuick.Controls 2.4
import QtQuick.Layouts 1.0
import QuickKeyboard 1.0
import "modes"
import "Theme.js" as Theme

Item {
    property variant storeFront;
    property bool firstOpen: true;

    id: searchUI
    visible: false

    function openSearch(open) {
        if (open) {
            searchUI.visible = true
            keyboard.dispatcher.setFocusObject(textInput);
            if (firstOpen) {
                firstOpen = false;
                fromYear.setDefault(storeFront.fromYear);
                toYear.setDefault(storeFront.toYear);
                fromYear.activated(fromYear.curIndex);

                language.setDefault(storeFront.language);
                extension.setDefault(storeFront.extension);
                order.setDefault(storeFront.order);
                storeFront.exactMatch == "1" && exactMatch.toggle();
                storeFront.query.length && (textInput.text = storeFront.query);
            }
        } else {
            searchUI.visible = false;
        }
    }

    function getParams() {
        storeFront.exactMatch = exactMatch.position;
        storeFront.fromYear = fromYear.value();
        storeFront.toYear = toYear.value();
        storeFront.language = language.value();
        storeFront.extension = extension.value();
        storeFront.order = order.value();
        storeFront.query = textInput.text;
    }

    function sendQuery() {
        getParams();
        storeFront.newQuery(0);
    }

    Rectangle {
        id: background
        anchors.fill: parent

        MouseArea {
            anchors.fill: parent
        }
    }

    Rectangle {
        id: searchBox
        color: Theme.colorPrimary
        height: 110
        anchors {
            left: parent.left
            right: parent.right
            top: parent.top
        }

        Image {
            source: "png/search"
            anchors.verticalCenter: parent.verticalCenter
            anchors.left: parent.left
            anchors.leftMargin: Theme.margin
            width: 50
            height: 50
        }

        TextField  {
            id: textInput
            font.pixelSize: 35
            color: Theme.colorTextInverse
            font.family: Theme.fontFamilyContent
            anchors { fill: parent; verticalCenter: parent.verticalCenter; topMargin: 10 }
            clip: true
            verticalAlignment: Text.AlignVCenter
            anchors.leftMargin: 120
            anchors.rightMargin: Theme.margin + 150
            placeholderText: "Search for title, author, ISBN, publisher, md5..."
            background: Rectangle {
                anchors.fill: parent
                color: Theme.colorPrimary
            }
        }

        Rectangle {
            visible: textInput.text.length > 0
            color: Theme.colorPrimary
            border.color: Theme.colorTextInverse
            border.width: Theme.borderWidth + 1
            width: Math.max(Theme.minTouchSize * 2, 130)
            height: Math.max(Theme.minTouchSize, 50)
            radius: Theme.radiusCard
            anchors {
                right: parent.right
                verticalCenter: parent.verticalCenter
                rightMargin: Theme.margin
            }
            Accessible.name: "Clear search"
            Text {
                text: "Clear"
                font.pixelSize: Theme.fontSizeBody
                color: Theme.colorTextInverse
                font.family: Theme.fontFamily
                font.bold: true
                anchors.centerIn: parent
                anchors.verticalCenterOffset: 2
            }
            MouseArea {
                anchors.fill: parent
                onClicked: textInput.text = ""
            }
        }
    }

    Row {
        anchors {
            left: parent.left
            leftMargin: Theme.margin
            top: searchBox.bottom
            topMargin: 30
        }
        spacing: 33

        Filter {
            id: fromYear
            model: {
                let a = ["Any"];
                let thisYear = (new Date).getFullYear();
                while (thisYear >= 1800) {
                    a.push(thisYear);
                    thisYear--;
                }
                return a;
            }
            width: 150
            text: "From"
            onActivated: {
                let oldIndex = toYear.curIndex;
                toYear.model = index > 0 ? fromYear.model.slice(0, index + 1) : fromYear.model;
                if (oldIndex <= index) {
                    toYear.curIndex = oldIndex;
                } else {
                    toYear.curIndex = index;
                }
            }
        }

        Filter {
            id: toYear
            model: fromYear.model
            text: "To"
            width: 150
        }

        Filter {
            id: language
            model: ["Any","Afrikaans","Albanian","Arabic","Armenian","Azerbaijani","Bashkir","Belarusian","Bengali","Berber","Bulgarian","Catalan","Chinese","Crimean Tatar","Croatian","Czech","Danish","Dutch","English","Esperanto","Finnish","French","Georgian","German","Greek","Gujarati","Hebrew","Hindi","Hungarian","Icelandic","Indigenous","Indonesian","Italian","Japanese","Kannada","Kazakh","Kirghiz","Korean","Latin","Latvian","Lithuanian","Malayalam","Marathi","Mongolian","Nepali","Norwegian","Odia","Persian","Polish","Portuguese","Romanian","Russian","Sanskrit","Serbian","Sinhala","Slovak","Slovenian","Somali","Spanish","Swahili","Swedish","Tajik","Tamil","Tatar","Telugu","Turkish","Ukrainian","Urdu","Uzbek","Vietnamese"]
            text: "Language"
            width: 350
        }

        Filter {
            id: extension
            model: ["Any","EPUB","PDF","AZW","AZW3","FB2","MOBI","DJVU","DJV","TXT","RTF","LIT","CBZ"]
            text: "Extension"
            width: 200
        }

        Filter {
            id: order
            model: [ "Most Popular", "Best Match", "Recently added", "By Title (A-Z)", "By Title (Z-A)", "By Year", "File Size Asc.", "File Size Des." ]
            text: "Sort by"
            width: 350
        }
    }

    Switch {
        id : exactMatch
        x: Theme.margin
        y: 280

        indicator: Rectangle {
            width: 80
            height: 40
            y: parent.height / 2 - height / 2
            radius: 20
            color: exactMatch.checked ? Theme.colorPrimary : Theme.colorSurface
            border.color: Theme.colorPrimary
            border.width: 1

            Rectangle {
                x: exactMatch.checked ? parent.width - width : 0
                width: 40
                height: 40
                radius: 20
                color: Theme.colorSurface
                border.color: Theme.colorPrimary
                border.width: 1
            }
        }

        contentItem: Text {
            text: "          Exact match"
            font.family: Theme.fontFamily
            font.bold: true
            font.pixelSize: Theme.fontSizeBody + 10
            color: Theme.colorText
            height: 40
            verticalAlignment: Text.AlignVCenter
        }
    }

    FlatButton {
        id: startQuery
        width: 200
        bgColor: Theme.colorPrimary
        fgColor: Theme.colorTextInverse
        text: "Search"
        y: 400
        anchors {
            right: parent.right
            rightMargin: Theme.margin
        }
        onTapped: sendQuery()
    }

    FlatButton {
        id: setDefaultQuery
        width: 350
        bgColor: Theme.colorSurface
        fgColor: Theme.colorText
        text: "Set as default query"
        borderWidth: 3
        y: 400
        anchors {
            left: parent.left
            leftMargin: Theme.margin
        }
        onTapped: {
            getParams();
            storeFront.setConfig();

            setDefaultQuery.text = "✔";
            resetButtonText.start();
        }
        Timer {
            id: resetButtonText
            interval: 3000; running: false; repeat: false
            onTriggered: setDefaultQuery.text = "Set as default query";
        }
    }
    
    FlatButton {
        id: resetFilter
        width: 250
        bgColor: Theme.colorSurface
        fgColor: Theme.colorText
        text: "Reset query"
        borderWidth: 3
        y: 400
        anchors {
            left: setDefaultQuery.right
            leftMargin: 30
        }
        onTapped: {
            if (exactMatch.position == 1.0)
                exactMatch.toggle();

            fromYear.reset();
            toYear.reset();
            language.reset();
            extension.reset();
            order.reset();
            textInput.text = "";
        }
    }

    Keyboard {
        id: keyboard
        anchors { left: parent.left; right: parent.right; bottom: parent.bottom }
        height: 626

Rectangle {
        anchors.fill: parent
        color: Theme.colorPrimary
    }

        mode: standard

        Standard {
            id: standard
            anchors.fill: parent
            anchors.topMargin: 93
            onSymbolsModeSwitched: keyboard.mode = symbols
            onEnter: sendQuery()
        }

        Symbols {
            id: symbols
            anchors.fill: parent
            anchors.topMargin: 93
            onStandardModeSwitched: keyboard.mode = standard
            onSymbolsModeSwitched: keyboard.mode = symbols2
            onEnter: sendQuery()
        }

        Symbols2 {
            id: symbols2
            anchors.fill: parent
            anchors.topMargin: 93
            onStandardModeSwitched: keyboard.mode = standard
            onSymbolsModeSwitched: keyboard.mode = symbols
            onEnter: sendQuery()
        }
    }

    Rectangle {
        id: closeSearchUI
        width: 80
        height: 80
        radius: Theme.radiusButton
        color: Theme.colorPrimary
        anchors {
            right: parent.right
            bottom: keyboard.top
            margins: Theme.margin
        }
        Accessible.name: "Close search"
        Text {
            text: "v"
            font.family: Theme.fontFamily
            font.bold: true
            color: Theme.colorTextInverse
            anchors.centerIn: parent
            font.pixelSize: Theme.fontSizeTitle
        }
        MouseArea {
            anchors.fill: parent
            onClicked: openSearch(false)
        }
    }

    Item {
        id: keyboardOverlay
        anchors.fill: keyboard
    }
}