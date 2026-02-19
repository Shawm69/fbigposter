"""Probe: click three dots -> Download -> see submenu options."""

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
        accept_downloads=True,
        args=["--disable-blink-features=AutomationControlled"],
    )

    page = await ctx.new_page()
    await page.goto("https://sora.chatgpt.com/d/gen_01khs6rs71fg598q3gvvfpjpjd", wait_until="domcontentloaded")
    await asyncio.sleep(5)

    # Find and click three-dot button (SVG with three circles: M3 12a2...M10...M17)
    svg_buttons = await page.query_selector_all("button:has(svg)")
    three_dot = None
    for btn in svg_buttons:
        inner = await btn.evaluate("e => e.querySelector('svg') ? e.querySelector('svg').innerHTML : ''")
        if "M3 12a2" in inner and "m7 0a2" in inner:
            three_dot = btn
            break

    if not three_dot:
        print("Three-dot not found!")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    print("Clicking three-dot menu...")
    await three_dot.click()
    await asyncio.sleep(2)

    # Click "Download"
    download_item = page.get_by_text("Download", exact=True)
    count = await download_item.count()
    print(f"'Download' items: {count}")

    if count > 0:
        await download_item.first.click()
        await asyncio.sleep(2)
        await page.screenshot(path="sora_detail_download_submenu.png")

        # Dump what appeared after clicking Download
        all_text = await page.evaluate("""() => {
            const result = [];
            const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while (node = walk.nextNode()) {
                const t = node.textContent.trim();
                if (t && t.length > 1 && t.length < 80) {
                    const rect = node.parentElement.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0 && rect.x > 800) {
                        result.push({
                            text: t,
                            x: Math.round(rect.x),
                            y: Math.round(rect.y),
                            tag: node.parentElement.tagName,
                            role: node.parentElement.getAttribute('role') || ''
                        });
                    }
                }
            }
            return result;
        }""")
        print("\nVisible text after clicking Download:")
        for item in all_text:
            print(f"  '{item['text']}' at {item['x']},{item['y']} <{item['tag']}> role={item['role']}")

        # Also check if a download was directly triggered
        downloads = []
        page.on("download", lambda d: downloads.append(d))
        await asyncio.sleep(3)
        if downloads:
            print(f"\nDirect download triggered: {downloads[0].suggested_filename}")

    print("\nBrowser stays open 60s...")
    await asyncio.sleep(60)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
