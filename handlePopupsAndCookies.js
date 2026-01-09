import fs from 'fs';
import path from 'path';

export async function handlePopupsAndCookies(page) {
    const screenshotsDir = path.resolve('./screenshots');
  // 🍪 Cookie accept
  try {

    // 📸 Səhifə ilk vəziyyət
    await page.screenshot({
      path: `${screenshotsDir}/before-popups.png`,
      fullPage: true
    });

    const cookieBtn = await page.$('button#onetrust-accept-btn-handler');
    if (cookieBtn) {
      await cookieBtn.click();   
    }
  } catch {}

  // 🌍 Location popup
  try {
    const geoPopup = await page.$('div.geolocation-modal__container');
    if (geoPopup) {
      await page.click('button.zds-dialog-close-button');
   
    }
  } catch {}
}
