const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto('http://localhost:8080');
  await page.waitForTimeout(1000);

  // Perform a move: Rotate Top face (White)
  // We can use the window.rubiksCube instance
  await page.evaluate(() => {
    window.rubiksCube.performMove({ axis: 'y', layer: 1, direction: 1 });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'step1_move.png' });

  // Press Reverse
  await page.click('#reverse-btn');
  await page.waitForTimeout(500);
  await page.screenshot({ path: 'step2_reverse_mode.png' });

  // Check if arrow is visible
  const arrowVisible = await page.evaluate(() => window.rubiksCube.arrowGroup.children.length > 0);
  console.log('Arrow visible:', arrowVisible);

  await browser.close();
})();
