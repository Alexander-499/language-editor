# Language Editor 🪷

With this small web app you can edit your apps' translations (with JSON) easily, you just need to select your directory and it will just work. You can add new keys and languages (files) and save by just clicking the button (No downloading, just clicking the button and it updates).
Your directory should look like this for example:

```
languages
├── de.json
├── en.json
└── fr.json
```

> [!NOTE]
> For bigger projects I recommend using services like [Tolgee](https://tolgee.io) or [Crowdin](https://crowdin.com) since this is slightly buggy and not that scalable. For my mobile app [Zpeedometer](https://zpeedometer.alexander499.de) I chose Tolgee since it is free and easy to implement into Vue (with a `t(key: string)` function).

## More info

I got the idea from the [Enhanced i18n json editor](https://marketplace.visualstudio.com/items?itemName=trystan4861.enhanced-i18n-json-editor), which worked horribly for me, so I made my own. Due to time constraints I made the whole JavaScript with ChatGPT, UI (HTML, CSS) were made by me.
