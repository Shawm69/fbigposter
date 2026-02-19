"""Probe: dump ALL interactive elements on Sora detail page, then click three dots."""

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

    # Dump ALL buttons with SVG analysis
    svg_buttons = await page.query_selector_all("button:has(svg)")
    print(f"=== All SVG buttons ({len(svg_buttons)}) ===")
    three_dot_btn = None
    for i, btn in enumerate(svg_buttons):
        box = await btn.bounding_box()
        aria = await btn.get_attribute("aria-label") or ""
        text = (await btn.evaluate("e => e.innerText.trim()")) or ""
        svg_id = await btn.evaluate("""e => {
            const paths = e.querySelectorAll('svg path, svg circle, svg line');
            const d = Array.from(paths).map(p => (p.getAttribute('d') || p.getAttribute('cx') || '')).join('|').slice(0, 80);
            return d;
        }""")
        pos = f"{box['x']:.0f},{box['y']:.0f} {box['width']:.0f}x{box['height']:.0f}" if box else "hidden"
        print(f"  [{i}] pos={pos} aria='{aria}' text='{text[:30]}' svg='{svg_id}'")

        # Identify three dots: three circles pattern or three "a2" arcs
        if svg_id and ("M3 12a2" in svg_id or svg_id.count("a2") >= 3 or svg_id.count("12") >= 3):
            three_dot_btn = btn
            print(f"       ^^^ This looks like three-dot menu!")

    # Also dump non-SVG buttons
    all_buttons = await page.query_selector_all("button")
    print(f"\n=== All buttons ({len(all_buttons)}) ===")
    for i, btn in enumerate(all_buttons):
        box = await btn.bounding_box()
        aria = await btn.get_attribute("aria-label") or ""
        text = (await btn.evaluate("e => e.innerText.trim()")) or ""
        pos = f"{box['x']:.0f},{box['y']:.0f} {box['width']:.0f}x{box['height']:.0f}" if box else "hidden"
        has_svg = await btn.evaluate("e => !!e.querySelector('svg')")
        print(f"  [{i}] pos={pos} aria='{aria}' text='{text[:40]}' svg={has_svg}")

    # Try to find the three-dot by its distinctive SVG pattern
    if not three_dot_btn:
        print("\nLooking harder for three-dot button...")
        for btn in svg_buttons:
            inner = await btn.evaluate("e => e.querySelector('svg').innerHTML")
            if "12a2" in inner or ("M3" in inner and "M10" in inner and "M17" in inner):
                three_dot_btn = btn
                print("Found by innerHTML match!")
                break

    if three_dot_btn:
        print("\nClicking three-dot button...")
        await three_dot_btn.click()
        await asyncio.sleep(2)
        await page.screenshot(path="sora_detail_menu.png")

        # Dump everything visible
        all_text = await page.evaluate("""() => {
            const result = [];
            const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
            let node;
            while (node = walk.nextNode()) {
                const t = node.textContent.trim();
                if (t && t.length > 1 && t.length < 50) {
                    const rect = node.parentElement.getBoundingClientRect();
                    if (rect.width > 0 && rect.height > 0) {
                        result.push({ text: t, x: Math.round(rect.x), y: Math.round(rect.y) });
                    }
                }
            }
            return result.filter(r => r.x > 800 || r.y > 50).slice(0, 30);
        }""")
        print("\nVisible text after clicking three-dot:")
        for item in all_text:
            print(f"  '{item['text']}' at {item['x']},{item['y']}")
    else:
        print("\nCould not find three-dot button at all!")
        await page.screenshot(path="sora_detail_no_threedot.png")

    print("\nBrowser stays open 60s...")
    await asyncio.sleep(60)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
