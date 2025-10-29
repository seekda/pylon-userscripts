# 🧩 Tampermonkey User Script Setup for Pylon

## 1. Install the Tampermonkey Extension

* [Tampermonkey – Chrome Web Store](https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobfkfo)
* [Tampermonkey – Microsoft Edge Add-on](https://microsoftedge.microsoft.com/addons/detail/tampermonkey/iikmkjmpaadaobahmlepeloendndfphd)

---

## 2. Get the User Script from GitHub

Download or open the script directly from GitHub:
[https://github.com/seekda/pylon-userscripts/raw/refs/heads/main/hotel-manager-btn_erp-btn.user.js](https://github.com/seekda/pylon-userscripts/raw/refs/heads/main/hotel-manager-btn_erp-btn.user.js)

After installing the extension and opening the above link, you will be redirected to the **script installation page** – simply click **Install**.

*(screenshot: `image-20250828-074715.png`)*

---

## 3. Configure the Extension Settings

Navigate to your browser’s extension settings:

* **Chrome:** `chrome://extensions/`
* **Edge:** `edge://extensions/`

### Chrome

1. Click **Details** on the Tampermonkey Extension.
2. Activate the **“Allow Userscripts”** option.

### Edge

1. Activate **Developer Mode** in the left sidebar.
   This allows Edge to execute userscripts.

---

## 4. Verify Installation

After a refresh in **Pylon**, you should now see the **Hotel-Manager Button**.

---

## 5. Add Your Analytics API Key (for Partner Button)

To make the Partner Button work, obtain your API Key from:
[https://analytics.seekda.com/users/me](https://analytics.seekda.com/users/me)

Then:

1. Go back to **Pylon** and refresh the page.
2. Click on the **Tampermonkey Extension icon** → open the installed script.
3. Add the obtained **API Key** inside the script configuration.

*(screenshot: `image-20250923-125058.png`)*

4. Refresh **Pylon** again → both buttons should now work.

---

## 6. Notes

This setup improves on the previous custom extension:

* You no longer need to reinstall updates manually — script updates are **pushed automatically**.
* The new version also adds a **“ERP” button**, which retrieves the partner by querying the first Hotel-Manager page and extracting it from the icon button there.
