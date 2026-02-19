"""Probe: click the unlabeled icon buttons on Sora detail page to find download."""

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

    # Get the unlabeled SVG icon buttons in the top-right area
    svg_buttons = await page.query_selector_all("button:has(svg)")
    top_right_btns = []
    for btn in svg_buttons:
        aria = await btn.get_attribute("aria-label") or ""
        box = await btn.bounding_box()
        if box and box["x"] > 700 and box["y"] < 80 and not aria:
            # Get SVG path data to identify the icon
            svg_info = await btn.evaluate("""e => {
                const svg = e.querySelector('svg');
                if (!svg) return {};
                const paths = svg.querySelectorAll('path');
                const pathData = Array.from(paths).map(p => p.getAttribute('d') || '').join(' ').slice(0, 100);
                return {
                    viewBox: svg.getAttribute('viewBox'),
                    width: svg.getAttribute('width'),
                    height: svg.getAttribute('height'),
                    pathSnippet: pathData,
                    innerHTML: svg.innerHTML.slice(0, 200)
                };
            }""")
            pos = f"{box['x']:.0f},{box['y']:.0f}"
            top_right_btns.append((btn, box, svg_info))
            print(f"Icon button at {pos}: {svg_info}")

    print(f"\nFound {len(top_right_btns)} unlabeled icon buttons in top-right area")

    # Also check the button at 1191,109 (below the others)
    for btn in svg_buttons:
        box = await btn.bounding_box()
        if box and abs(box["y"] - 109) < 20 and box["x"] > 1100:
            svg_info = await btn.evaluate("""e => {
                const svg = e.querySelector('svg');
                if (!svg) return {};
                const paths = svg.querySelectorAll('path');
                const pathData = Array.from(paths).map(p => p.getAttribute('d') || '').join(' ').slice(0, 100);
                return { pathSnippet: pathData, innerHTML: svg.innerHTML.slice(0, 200) };
            }""")
            print(f"\nButton at ~1191,109: {svg_info}")
            top_right_btns.append((btn, box, svg_info))

    # Try clicking each one and see what happens
    for i, (btn, box, info) in enumerate(top_right_btns):
        pos = f"{box['x']:.0f},{box['y']:.0f}"
        print(f"\n--- Clicking button at {pos} ---")

        # Listen for downloads
        downloads = []
        page.on("download", lambda d: downloads.append(d))

        await btn.click()
        await asyncio.sleep(2)

        if downloads:
            print(f"  DOWNLOAD triggered! filename: {downloads[0].suggested_filename}")
            continue

        # Check if a menu/popover appeared
        # Look for any new visible text that wasn't there before
        new_text = await page.evaluate("""() => {
            const els = document.querySelectorAll('[role="menu"], [role="listbox"], [role="dialog"], [class*="popover"], [class*="dropdown"], [class*="menu"]');
            return Array.from(els).map(e => ({
                role: e.getAttribute('role'),
                text: e.innerText.trim().slice(0, 200),
                cls: (e.className || '').toString().slice(0, 60)
            }));
        }""")
        if new_text:
            print(f"  Popover/menu appeared:")
            for item in new_text:
                print(f"    role={item['role']} text='{item['text']}' class='{item['cls']}'")

        # Also check for new buttons/items
        new_items = await page.query_selector_all('[role="menuitem"], [role="option"]')
        if new_items:
            print(f"  Menu items: {len(new_items)}")
            for mi in new_items:
                text = (await mi.evaluate("e => e.innerText.trim()")) or ""
                print(f"    '{text}'")

        await page.screenshot(path=f"sora_detail_click_{i}.png")

        # Close any popover by pressing Escape
        await page.keyboard.press("Escape")
        await asyncio.sleep(1)

    print("\nBrowser stays open 60s...")
    await asyncio.sleep(60)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
