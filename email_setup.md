# Návod na zprovoznění e-mailů

Aby ti chodily krásné e-maily jako z `email_template.html`, postupuj takto:

## 1. Nastavení EmailJS (Zabere 2 minuty)

1.  Jdi na [EmailJS.com](https://www.emailjs.com/) a zaregistruj se (je to zdarma).
2.  V sekci **Email Services** přidej novou službu (např. připoj svůj Gmail).
    *   Zkopíruj si `Service ID` (např. `service_xyz`).
3.  V sekci **Email Templates** vytvoř novou šablonu.
    *   Klikni na **Source Code** (tlačítko `< >`).
    *   Vlož tam celý obsah souboru `c:\pp\email_template.html`.
    *   Ulož šablonu.
    *   Zkopíruj si `Template ID` (např. `template_abc`).

## 2. Propojení s kódem

Otevři soubor `c:\pp\register.html` a uprav ho:

1.  Najdi řádek s `emailjs.init("YOUR_PUBLIC_KEY_HERE");`
    *   Místo toho vlož svůj **Public Key** (najdeš v EmailJS v sekci Account).
2.  Najdi řádek `emailjs.send('YOUR_SERVICE_ID', 'YOUR_TEMPLATE_ID', ...)`
    *   Doplň svá ID z kroku 1.

## 3. Hotovo!

Teď když se registruješ, přijde ti skutečný profesionální e-mail.
Pokud klíče nevyplníš, stránka bude pořád fungovat v "Demo režimu" (ukáže kód na obrazovce).
