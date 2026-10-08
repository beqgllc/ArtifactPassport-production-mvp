# Browser extension — Phase 2

Keep the extension thin. The production MVP should not duplicate the inspection engine. The extension should only detect supported AI artifact downloads and deep-link the file into the web app.

Recommended MV3 flow:

1. `chrome.downloads.onCreated` observes downloads after the user has explicitly enabled that permission.
2. Match only known AI-tool download domains and supported extensions.
3. Store the download URL locally for a short period.
4. Popup presents `Inspect in ArtifactPassport`.
5. The web app performs the same local inspection and produces the passport.

Do not silently upload downloaded files. Do not read arbitrary browsing history. Request the smallest possible permission set.
