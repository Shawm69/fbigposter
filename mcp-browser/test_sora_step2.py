"""Sora Step 2: Set duration to 25s, type master prompt, then pause."""

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
    print("Opening sora storyboard...")
    await page.goto("https://sora.chatgpt.com/storyboard", wait_until="domcontentloaded")
    await asyncio.sleep(5)
    print(f"URL: {page.url}")

    if "login" in page.url:
        print("NOT LOGGED IN — log in first")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    # Step 1: Click the duration button to open the popover
    # The button shows "10s" by default
    dur_btn = await page.query_selector('button:has-text("10s")')
    if not dur_btn:
        # Try other duration labels in case it's already set differently
        for label in ["5s", "15s", "20s", "25s"]:
            dur_btn = await page.query_selector(f'button:has-text("{label}")')
            if dur_btn:
                break
    print(f"Duration button found: {dur_btn is not None}")

    if dur_btn:
        await dur_btn.click()
        await asyncio.sleep(1)
        print("Duration popover should be open")

        # Step 2: Click "25 seconds" — it's the TOP option in the small modal
        # First, dump what's in the modal so we can see the structure
        modal_html = await page.evaluate("""() => {
            // Find all elements whose text is exactly "25 seconds"
            const all = document.querySelectorAll('*');
            const matches = [];
            for (const el of all) {
                const t = el.textContent.trim();
                if (t === '25 seconds' || t === '25 Seconds') {
                    matches.push({
                        tag: el.tagName,
                        text: t,
                        cls: (el.className || '').toString().slice(0, 60),
                        role: el.getAttribute('role'),
                        childCount: el.children.length
                    });
                }
            }
            return matches;
        }""")
        print(f"Elements with exact '25 seconds' text: {modal_html}")

        # Use Playwright locator with exact text match for the innermost element
        loc = page.get_by_text("25 seconds", exact=True)
        count = await loc.count()
        print(f"Locator '25 seconds' exact matches: {count}")

        if count > 0:
            await loc.first.click()
            await asyncio.sleep(1)
            print("Clicked '25 seconds' (first exact match)")
        else:
            # Fallback: try "25 Seconds" capitalized
            loc2 = page.get_by_text("25 Seconds", exact=True)
            count2 = await loc2.count()
            print(f"Locator '25 Seconds' exact matches: {count2}")
            if count2 > 0:
                await loc2.first.click()
                await asyncio.sleep(1)
                print("Clicked '25 Seconds'")
            else:
                print("Could not find '25 seconds' option. Taking screenshot...")
                await page.screenshot(path="sora_s2_popover_debug.png")
    else:
        print("Could not find duration button!")
        await page.screenshot(path="sora_s2_no_dur_btn.png")

    await page.screenshot(path="sora_s2_after_duration.png")

    # Step 3: Type the master prompt
    prompt_input = await page.query_selector('textarea[placeholder*="Describe your video"]')
    if not prompt_input:
        # Fallback: any textarea on the page
        prompt_input = await page.query_selector("textarea")
    print(f"Master prompt textarea found: {prompt_input is not None}")

    if prompt_input:
        placeholder = await prompt_input.get_attribute("placeholder") or ""
        print(f"Placeholder: '{placeholder}'")
        await prompt_input.click()
        await prompt_input.fill("a baby panda eating bamboo in a zen garden with cherry blossoms falling gently")
        await asyncio.sleep(1)
        print("Master prompt typed")

    await page.screenshot(path="sora_s2_prompt_typed.png")
    print("\nDone! Duration set + prompt typed. Browser stays open 60s for you to confirm...")
    await asyncio.sleep(60)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
