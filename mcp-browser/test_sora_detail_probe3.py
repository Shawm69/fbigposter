"""Probe: click the three-dot menu (1205,44) on Sora detail page."""

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

    # Find the three-dot button by its SVG path (three circles)
    three_dot = None
    svg_buttons = await page.query_selector_all("button:has(svg)")
    for btn in svg_buttons:
        path_data = await btn.evaluate("""e => {
            const paths = e.querySelectorAll('svg path');
            return Array.from(paths).map(p => p.getAttribute('d') || '').join(' ');
        }""")
        if "M3 12a2" in path_data and "M10 12a2" in path_data:
            three_dot = btn
            break

    if not three_dot:
        print("Three-dot button not found by SVG path, trying position click")
        await page.mouse.click(1205, 44)
        await asyncio.sleep(2)
    else:
        print("Found three-dot button, clicking...")
        await three_dot.click()
        await asyncio.sleep(2)

    await page.screenshot(path="sora_detail_threedot_open.png")

    # Dump everything that appeared
    print("\n=== Menu items ===")
    for role in ["menuitem", "option", "listitem"]:
        items = await page.query_selector_all(f'[role="{role}"]')
        for item in items:
            text = (await item.evaluate("e => e.innerText.trim()")) or ""
            print(f"  [{role}] '{text}'")

    # Dump any new visible elements with text
    print("\n=== Popover/dropdown content ===")
    popover_content = await page.evaluate("""() => {
        // Look for elements that might be a dropdown/popover
        const candidates = document.querySelectorAll(
            '[role="menu"], [role="listbox"], [role="dialog"], ' +
            '[class*="popover"], [class*="dropdown"], [class*="menu"], ' +
            '[class*="overlay"], [data-radix-popper-content-wrapper]'
        );
        return Array.from(candidates).map(e => ({
            tag: e.tagName,
            role: e.getAttribute('role'),
            text: e.innerText.trim().slice(0, 300),
            cls: (e.className || '').toString().slice(0, 80)
        }));
    }""")
    for item in popover_content:
        print(f"  <{item['tag']}> role={item['role']} class='{item['cls']}'")
        print(f"    text: '{item['text']}'")

    # Also just dump all visible text near the click area
    print("\n=== All clickable items currently visible ===")
    clickables = await page.query_selector_all("button, a, [role='menuitem'], [role='option'], [tabindex]")
    for el in clickables:
        text = (await el.evaluate("e => e.innerText.trim()")) or ""
        box = await el.bounding_box()
        if box and text and box["x"] > 900:
            print(f"  text='{text[:60]}' pos={box['x']:.0f},{box['y']:.0f}")

    print("\nBrowser stays open 60s...")
    await asyncio.sleep(60)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
