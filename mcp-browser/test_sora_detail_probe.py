"""Probe the Sora detail page to find download methods for video without watermark."""

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
    print(f"URL: {page.url}")

    # Dump all buttons
    buttons = await page.query_selector_all("button")
    print(f"\n=== All buttons ({len(buttons)}) ===")
    for i, btn in enumerate(buttons):
        text = (await btn.evaluate("e => e.innerText.trim()")) or ""
        aria = await btn.get_attribute("aria-label") or ""
        title = await btn.get_attribute("title") or ""
        box = await btn.bounding_box()
        pos = f"{box['x']:.0f},{box['y']:.0f} {box['width']:.0f}x{box['height']:.0f}" if box else "hidden"
        if text or aria or title:
            print(f"  [{i}] text='{text[:50]}' aria='{aria}' title='{title}' pos={pos}")

    # Dump all links
    links = await page.query_selector_all("a")
    print(f"\n=== All links ({len(links)}) ===")
    for i, link in enumerate(links):
        text = (await link.evaluate("e => e.innerText.trim()")) or ""
        href = await link.get_attribute("href") or ""
        download = await link.get_attribute("download")
        if text or href:
            print(f"  [{i}] text='{text[:50]}' href='{href[:80]}' download={download}")

    # Look for video elements
    videos = await page.query_selector_all("video")
    print(f"\n=== Video elements ({len(videos)}) ===")
    for i, vid in enumerate(videos):
        src = await vid.get_attribute("src") or ""
        poster = await vid.get_attribute("poster") or ""
        sources = await vid.query_selector_all("source")
        print(f"  [{i}] src='{src[:100]}' poster='{poster[:80]}' sources={len(sources)}")
        for s in sources:
            s_src = await s.get_attribute("src") or ""
            s_type = await s.get_attribute("type") or ""
            print(f"    source: src='{s_src[:100]}' type='{s_type}'")

    # Look for any menu items with "download" text
    print("\n=== Elements containing 'download' text ===")
    all_els = await page.query_selector_all("*")
    for el in all_els:
        try:
            text = await el.evaluate("e => e.childNodes.length === 1 && e.childNodes[0].nodeType === 3 ? e.textContent.trim() : ''")
            if text and "download" in text.lower():
                tag = await el.evaluate("e => e.tagName")
                cls = await el.evaluate("e => (e.className || '').toString().slice(0, 60)")
                role = await el.get_attribute("role") or ""
                print(f"  <{tag}> text='{text}' role='{role}' class='{cls}'")
        except:
            pass

    # Now try clicking the three-dot / more options button
    print("\n=== Trying to open menus ===")
    for aria in ["More", "More options", "Options", "Menu"]:
        btn = await page.query_selector(f'button[aria-label="{aria}"]')
        if btn:
            print(f"Found button aria-label='{aria}', clicking...")
            await btn.click()
            await asyncio.sleep(2)

            # Dump menu items that appeared
            menuitems = await page.query_selector_all('[role="menuitem"], [role="option"]')
            print(f"  Menu items: {len(menuitems)}")
            for mi in menuitems:
                text = (await mi.evaluate("e => e.innerText.trim()")) or ""
                print(f"    menuitem: '{text}'")

            # Also check for any new popover/dropdown
            new_buttons = await page.query_selector_all("button")
            for nb in new_buttons:
                text = (await nb.evaluate("e => e.innerText.trim()")) or ""
                if text and text not in [await b.evaluate("e => e.innerText.trim()") for b in buttons[:5]]:
                    if "download" in text.lower() or "video" in text.lower() or "watermark" in text.lower():
                        print(f"    new button: '{text}'")

            await page.screenshot(path="sora_detail_menu_open.png")
            break

    # Check for any SVG download icons
    print("\n=== SVG icon buttons (possible download) ===")
    svg_buttons = await page.query_selector_all("button:has(svg)")
    for i, btn in enumerate(svg_buttons):
        aria = await btn.get_attribute("aria-label") or ""
        title = await btn.get_attribute("title") or ""
        box = await btn.bounding_box()
        if box and box["width"] < 80:
            pos = f"{box['x']:.0f},{box['y']:.0f} {box['width']:.0f}x{box['height']:.0f}"
            print(f"  [{i}] aria='{aria}' title='{title}' pos={pos}")

    await page.screenshot(path="sora_detail_probe.png")
    print("\nBrowser stays open 60s...")
    await asyncio.sleep(60)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
