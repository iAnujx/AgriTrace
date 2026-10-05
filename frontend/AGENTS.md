<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Legacy pages from the original upload live in src/views and are mounted by thin route files; they use src/lib/router-compat for navigation so the original code stays unchanged.
- Marketplace listings are stored in the browser; QR codes carry the full crop journey inside the link so the /trace page works on any phone without a server.
- Whole-UI translation uses the Google Translate engine via LanguageSwitcher, so new text is translated automatically without dictionaries.
