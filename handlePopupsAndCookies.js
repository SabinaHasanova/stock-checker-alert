import fs from 'fs';
import path from 'path';

/*
  handlePopupsAndCookies(page)
  - Attempts to accept cookie banners and close common location/geolocation popups
  - Uses defensive try/catch blocks and writes debug logs on failures.
*/
export async function handleZaraPopupsAndCookies(page) {
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
  } catch (err) {
    console.debug('handlePopupsAndCookies: cookie accept error:', err.message);
  }

  // 🌍 Location popup
  try {
    const geoPopup = await page.$('div.geolocation-modal__container');
    if (geoPopup) {
      await page.click('button.zds-dialog-close-button');
    }
  } catch (err) {
    console.debug('handlePopupsAndCookies: geo popup handling error:', err.message);
  }
}

export async function handleMangoPopupsAndCookies(page) {
   const screenshotsDir = path.resolve('./screenshots');
  // 🍪 Cookie accept
  try {

    // 📸 Səhifə ilk vəziyyət
    await page.screenshot({
      path: `${screenshotsDir}/before-popups.png`,
      fullPage: true
    });

    const cookieBtn = await page.$('button#cookies.button.acceptAll');
    if (cookieBtn) {
      await cookieBtn.click();   
    }
  } catch (err) {
    console.debug('handlePopupsAndCookies: cookie accept error:', err.message);
  }

  // 🌍 Location popup
  try {
    const geoPopup = await page.$('div.Header_close__kVWB_');
    if (geoPopup) {
      await page.click('button.Header_area__YsuGp');
    }
  } catch (err) {
    console.debug('handlePopupsAndCookies: geo popup handling error:', err.message);
  }
}
