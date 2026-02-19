"""Sora Steps 1-7: Open storyboard, set duration, type prompt, submit,
wait for scene cards, click Create, navigate to drafts."""

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

    # ── Step 1: Open storyboard ──
    print("Step 1: Opening storyboard...")
    await page.goto("https://sora.chatgpt.com/storyboard", wait_until="domcontentloaded")
    await asyncio.sleep(5)
    print(f"  URL: {page.url}")

    if "login" in page.url:
        print("NOT LOGGED IN — log in first")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    # ── Step 2: Set duration to 25s ──
    print("Step 2: Setting duration to 25s...")
    dur_btn = None
    for label in ["10s", "5s", "15s", "20s", "25s"]:
        dur_btn = await page.query_selector(f'button:has-text("{label}")')
        if dur_btn:
            print(f"  Found duration button: '{label}'")
            break

    if dur_btn:
        await dur_btn.click()
        await asyncio.sleep(1)
        loc = page.get_by_text("25 seconds", exact=True)
        if await loc.count() > 0:
            await loc.first.click()
            await asyncio.sleep(1)
            print("  Selected '25 seconds'")
        else:
            print("  ERROR: Could not find '25 seconds' option")
            await page.screenshot(path="sora_test_dur_fail.png")
    else:
        print("  ERROR: No duration button found")

    # ── Step 3: Type master prompt (bottom input: "Describe your video...") ──
    print("Step 3: Typing master prompt...")
    textarea = await page.query_selector('textarea[placeholder*="Describe your video"]')
    if not textarea:
        # Dump all textareas to debug
        all_ta = await page.query_selector_all("textarea")
        print(f"  Could not find 'Describe your video' textarea. Found {len(all_ta)} textareas:")
        for i, ta in enumerate(all_ta):
            ph = await ta.get_attribute("placeholder") or ""
            print(f"    [{i}] placeholder='{ph}'")
        await page.screenshot(path="sora_test_no_master_prompt.png")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    placeholder = await textarea.get_attribute("placeholder") or ""
    print(f"  Found master prompt textarea: '{placeholder}'")
    await textarea.click()
    await textarea.fill("a baby panda eating bamboo in a zen garden with cherry blossoms falling gently")
    await asyncio.sleep(1)
    print("  Prompt typed")

    # ── Step 4: Click Submit for master prompt ──
    print("Step 4: Clicking Submit...")
    submit_btn = await page.query_selector('button[aria-label="Submit"]')
    if not submit_btn:
        submit_btn = await page.query_selector('button:has-text("Submit")')
    if not submit_btn:
        # Dump all buttons to find the right one
        buttons = await page.query_selector_all("button")
        print(f"  No Submit button found. Listing all {len(buttons)} buttons:")
        for btn in buttons:
            text = (await btn.evaluate("e => e.innerText.trim()")) or ""
            aria = await btn.get_attribute("aria-label") or ""
            if text or aria:
                print(f"    text='{text[:40]}' aria='{aria}'")
        await page.screenshot(path="sora_test_no_submit.png")
        await asyncio.sleep(30)
        await ctx.close()
        await pw.stop()
        return

    await submit_btn.click()
    print("  Submitted!")
    await asyncio.sleep(3)
    await page.screenshot(path="sora_test_after_submit.png")

    # ── Step 5: Wait for storyboard scene cards (5+ min) ──
    print("Step 5: Waiting for storyboard scene cards (up to 10 min)...")
    deadline = asyncio.get_event_loop().time() + 600  # 10 min max
    found_scenes = False
    poll_count = 0
    while asyncio.get_event_loop().time() < deadline:
        poll_count += 1

        # Check for "Scene 1" text
        loc = page.get_by_text("Scene 1")
        count = await loc.count()
        if count > 0:
            print(f"  Scene cards detected after {poll_count * 5}s!")
            found_scenes = True
            break

        # Also check for scene-related elements
        scenes = await page.query_selector_all('[class*="scene"], [data-testid*="scene"]')
        if len(scenes) >= 1:
            print(f"  Scene elements detected after {poll_count * 5}s!")
            found_scenes = True
            break

        if poll_count % 12 == 0:  # Every 60s
            elapsed = poll_count * 5
            print(f"  Still waiting... ({elapsed}s elapsed)")
            await page.screenshot(path=f"sora_test_waiting_{elapsed}s.png")

        await asyncio.sleep(5)

    if not found_scenes:
        print("  WARNING: Timed out waiting for scene cards. Taking screenshot...")
        await page.screenshot(path="sora_test_scene_timeout.png")

    await page.screenshot(path="sora_test_scenes_ready.png")

    # ── Step 6: Snapshot existing drafts ──
    print("Step 6: Getting existing drafts list...")
    # Open a new tab to check drafts without losing storyboard state
    drafts_tab = await ctx.new_page()
    await drafts_tab.goto("https://sora.chatgpt.com/drafts", wait_until="domcontentloaded")
    await asyncio.sleep(3)
    existing_links = await drafts_tab.query_selector_all('a[href^="/d/"]')
    existing_hrefs = set()
    for link in existing_links:
        href = await link.get_attribute("href")
        if href:
            existing_hrefs.add(href)
    print(f"  Existing drafts: {len(existing_hrefs)}")
    await drafts_tab.close()

    # ── Step 6b: Click Create ──
    print("Step 6b: Clicking Create...")
    create_btn = await page.query_selector('button:has-text("Create")')
    if not create_btn:
        create_btn = await page.query_selector('button[aria-label="Create"]')
    if create_btn:
        text = await create_btn.evaluate("e => e.innerText.trim()")
        disabled = await create_btn.is_disabled()
        print(f"  Create button: text='{text}' disabled={disabled}")
        if not disabled:
            await create_btn.click()
            print("  Clicked Create!")
            await asyncio.sleep(5)
        else:
            print("  ERROR: Create button is disabled")
            await page.screenshot(path="sora_test_create_disabled.png")
    else:
        print("  ERROR: No Create button found")
        await page.screenshot(path="sora_test_no_create.png")

    await page.screenshot(path="sora_test_after_create.png")

    # ── Step 7: Navigate to /drafts and wait for new video ──
    print("Step 7: Navigating to drafts, waiting for new video (up to 15 min)...")
    await page.goto("https://sora.chatgpt.com/drafts", wait_until="domcontentloaded")
    await asyncio.sleep(3)

    draft_deadline = asyncio.get_event_loop().time() + 900  # 15 min
    new_draft = None
    draft_poll = 0
    while asyncio.get_event_loop().time() < draft_deadline:
        draft_poll += 1
        current_links = await page.query_selector_all('a[href^="/d/"]')
        current_hrefs = []
        for link in current_links:
            href = await link.get_attribute("href")
            if href:
                current_hrefs.append(href)

        new_hrefs = [h for h in current_hrefs if h not in existing_hrefs]
        if new_hrefs:
            new_draft = new_hrefs[0]
            print(f"  New draft found after {draft_poll * 30}s: {new_draft}")
            break

        if draft_poll % 2 == 0:
            elapsed = draft_poll * 30
            print(f"  Still waiting for draft... ({elapsed}s, {len(current_hrefs)} total drafts)")

        await page.reload(wait_until="domcontentloaded")
        await asyncio.sleep(30)

    if new_draft:
        print(f"\nSUCCESS: Steps 1-7 complete! New draft at: {new_draft}")
    else:
        print("\nTIMEOUT: No new draft appeared within 15 minutes")

    await page.screenshot(path="sora_test_final.png")
    print("\nBrowser stays open 60s for you to check...")
    await asyncio.sleep(60)
    await ctx.close()
    await pw.stop()


if __name__ == "__main__":
    asyncio.run(test())
