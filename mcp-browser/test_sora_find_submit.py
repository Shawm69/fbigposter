"""Probe: type master prompt then dump all nearby buttons to find the right submit."""

import asyncio
from pathlib import Path
from playwright.async_api import async_playwright


async def test():
    pw = await async_playwright().start()
    user_data = Path.home() / ".smi-browser"

    ctx = await pw.chromium.launch_persistent_context(
        user_data_dir=str(user_data),
        headless=False,
        viewport={"width": 1280, "height": 900},
        args=["--disable-blink-features=AutomationControlled"],
    )

    page = await ctx.new_page()
    await page.goto("https://sora.chatgpt.com/storyboard", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Type prompt into the master prompt textarea
    textarea = await page.query_selector('textarea[placeholder*="Describe your video"]')
    if textarea:
        await textarea.click()
        await textarea.fill("a baby panda eating bamboo in a zen garden")
        await asyncio.sleep(1)
        print("Prompt typed into master prompt textarea")
    else:
        print("ERROR: No master prompt textarea found")

    # Dump every button on the page
    buttons = await page.query_selector_all("button")
    print(f"\nAll buttons on page ({len(buttons)}):")
    for i, btn in enumerate(buttons):
        text = (await btn.evaluate("e => e.innerText.trim()")) or ""
        aria = await btn.get_attribute("aria-label") or ""
        disabled = await btn.is_disabled()
        box = await btn.bounding_box()
        pos = f"{box['x']:.0f},{box['y']:.0f} {box['width']:.0f}x{box['height']:.0f}" if box else "hidden"
        print(f"  [{i}] text='{text[:40]}' aria='{aria}' disabled={disabled} pos={pos}")

    await page.screenshot(path="sora_find_submit.png")
    print("\nBrowser stays open 60s...")
    await asyncio.sleep(60)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
