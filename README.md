# 🛡️ HackShield

Webová platforma s **registrací a přihlášením uživatelů**, postavená na Node.js a PostgreSQL. Hesla se ukládají bezpečně jako **bcrypt hash** (nikdy v plaintextu) a po registraci se uživateli odešle potvrzovací e-mail.

> Projekt na vyzkoušení full-stack autentizace – od formuláře přes API až po databázi a bezpečné ukládání hesel.

## ✨ Funkce

- 🔐 **Registrace a přihlášení** uživatelů
- 🧂 **Bezpečné ukládání hesel** pomocí `bcryptjs` (hashování + salt)
- 🗄️ **PostgreSQL** databáze pro uživatelské účty
- 📧 **Potvrzovací e-maily** přes EmailJS (s demo režimem, když nejsou klíče)
- 🌐 **REST API** na Express s podporou CORS
- ⚙️ **Konfigurace přes `.env`** (dotenv) – žádné citlivé údaje v kódu

## 🛠️ Použité technologie

| Oblast | Technologie |
|---|---|
| Backend | Node.js, Express |
| Databáze | PostgreSQL (`pg`) |
| Bezpečnost | bcryptjs |
| E-maily | EmailJS |
| Konfigurace | dotenv, cors, body-parser |

## 🚀 Spuštění lokálně

```bash
# 1. Naklonuj repozitář
git clone https://github.com/bombaeu/HackShield.git
cd HackShield

# 2. Nainstaluj závislosti
npm install

# 3. Vytvoř soubor .env (viz níže)

# 4. Spusť server
npm start
```

### Konfigurace `.env`

```env
DATABASE_URL=postgres://uzivatel:heslo@localhost:5432/hackshield
PORT=3000
```

### Nastavení e-mailů

Návod na propojení s EmailJS najdeš v souboru [`email_setup.md`](./email_setup.md). Bez vyplněných klíčů aplikace běží v **demo režimu** (potvrzovací kód se zobrazí na obrazovce místo odeslání e-mailem).

## 📂 Struktura projektu

```
HackShield/
├── server.js          # Express server + API endpointy
├── public/            # frontend (registrace, přihlášení)
├── email_setup.md     # návod na zprovoznění e-mailů
└── package.json
```

## 🔒 Poznámka k bezpečnosti

- Hesla se nikdy neukládají v čitelné podobě – jen jako bcrypt hash.
- Citlivé údaje (DB, klíče) patří do `.env`, který je v `.gitignore`.

## 🧭 Co bych chtěl dodělat

- [ ] Ověření e-mailu při registraci
- [ ] Reset hesla
- [ ] Session / JWT autentizace

---

*Osobní full-stack projekt zaměřený na bezpečnou autentizaci uživatelů.*
