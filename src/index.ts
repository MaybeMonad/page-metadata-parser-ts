type Context = { url: string };

type ValueOf<T> = T[keyof T];

function makeUrlAbsolute(base: string, relative: string) {
  return new URL(relative, base).href;
}

function parseUrl(url: string) {
  return new URL(url).host;
}

function getProvider(host: string) {
  return host
    .replace(/www[a-zA-Z0-9]*\./, '')
    .replace('.co.', '.')
    .split('.')
    .slice(0, -1)
    .join(' ');
}

function buildRuleSet(ruleSet: ValueOf<RuleSets>) {
  return (doc: Document, context: Context) => {
    let maxScore = 0;
    let maxValue;

    for (let currRule = 0; currRule < ruleSet.rules.length; currRule++) {
      const [query, handler] = ruleSet.rules[currRule];

      const elements = Array.from(doc.querySelectorAll(query));

      if (elements.length) {
        for (const element of elements) {
          let score = ruleSet.rules.length - currRule;

          if (ruleSet.scorers) {
            for (const scorer of ruleSet.scorers) {
              const newScore = scorer(element, score);

              if (newScore) {
                score = newScore;
              }
            }
          }

          if (score > maxScore) {
            maxScore = score;
            maxValue = handler(element);
          }
        }
      }
    }

    if (!maxValue && ruleSet.defaultValue) {
      maxValue = ruleSet.defaultValue(context);
    }

    if (maxValue) {
      if (ruleSet.processors) {
        for (const processor of ruleSet.processors) {
          maxValue = processor(maxValue as string, context);
        }
      }

      if (typeof maxValue === 'string') {
        maxValue = maxValue.trim();
      }

      return maxValue;
    }
  };
}

type RuleSets = {
  [key: string]: {
    rules: [string, (element: Element) => string | null][];
    scorers?: ((element: Element, score: number) => number | undefined)[];
    defaultValue?: (context: Context) => string;
    processors?: (((value: string, context: Context) => string) | ((keywords: string, context: Context) => string[]))[];
  }
}

const metadataRuleSets: RuleSets = {
  description: {
    rules: [
      ['meta[property="og:description"]', (element: Element) => element.getAttribute('content')],
      ['meta[name="description" i]', (element: Element) => element.getAttribute('content')],
    ],
  },

  icon: {
    rules: [
      ['link[rel="apple-touch-icon"]', (element: Element) => element.getAttribute('href')],
      ['link[rel="apple-touch-icon-precomposed"]', (element: Element) => element.getAttribute('href')],
      ['link[rel="icon" i]', (element: Element) => element.getAttribute('href')],
      ['link[rel="fluid-icon"]', (element: Element) => element.getAttribute('href')],
      ['link[rel="shortcut icon"]', (element: Element) => element.getAttribute('href')],
      ['link[rel="Shortcut Icon"]', (element: Element) => element.getAttribute('href')],
      ['link[rel="mask-icon"]', (element: Element) => element.getAttribute('href')],
    ],
    scorers: [
      // Handles the case where multiple icons are listed with specific sizes ie
      // <link rel="icon" href="small.png" sizes="16x16">
      // <link rel="icon" href="large.png" sizes="32x32">
      (element: Element, score: number) => {
        const sizes = element.getAttribute('sizes');

        if (sizes) {
          const sizeMatches = sizes.match(/\d+/g);
          if (sizeMatches) {
            return Number(sizeMatches[0]);
          }
        }
      }
    ],
    defaultValue: (context: Context) => 'favicon.ico',
    processors: [
      (icon_url: string, context: Context) => makeUrlAbsolute(context.url, icon_url)
    ]
  },

  image: {
    rules: [
      ['meta[property="og:image:secure_url"]', (element: Element) => element.getAttribute('content')],
      ['meta[property="og:image:url"]', (element: Element) => element.getAttribute('content')],
      ['meta[property="og:image"]', (element: Element) => element.getAttribute('content')],
      ['meta[name="twitter:image"]', (element: Element) => element.getAttribute('content')],
      ['meta[property="twitter:image"]', (element: Element) => element.getAttribute('content')],
      ['meta[name="thumbnail"]', (element: Element) => element.getAttribute('content')],
    ],
    processors: [
      (image_url: string, context: Context) => makeUrlAbsolute(context.url, image_url)
    ],
  },

  keywords: {
    rules: [
      ['meta[name="keywords" i]', (element: Element) => element.getAttribute('content')],
    ],
    processors: [
      (keywords: string, context: Context) => keywords.split(',').map((keyword) => keyword.trim())
    ]
  },

  title: {
    rules: [
      ['meta[property="og:title"]', (element: Element) => element.getAttribute('content')],
      ['meta[name="twitter:title"]', (element: Element) => element.getAttribute('content')],
      ['meta[property="twitter:title"]', (element: Element) => element.getAttribute('content')],
      ['meta[name="hdl"]', (element: Element) => element.getAttribute('content')],
      ['title', (element: Element) => (element as HTMLTitleElement).text],
    ],
  },

  language: {
    rules: [
      ['html[lang]', (element: Element) => element.getAttribute('lang')],
      ['meta[name="language" i]', (element: Element) => element.getAttribute('content')],
    ],
    processors: [
      (language: string, context: Context) => language.split('-')[0]
    ]
  },

  type: {
    rules: [
      ['meta[property="og:type"]', (element: Element) => element.getAttribute('content')],
    ],
  },

  url: {
    rules: [
      ['a.amp-canurl', (element: Element) => element.getAttribute('href')],
      ['link[rel="canonical"]', (element: Element) => element.getAttribute('href')],
      ['meta[property="og:url"]', (element: Element) => element.getAttribute('content')],
    ],
    defaultValue: (context: Context) => context.url,
    processors: [
      (url: string, context: Context) => makeUrlAbsolute(context.url, url)
    ]
  },

  provider: {
    rules: [
      ['meta[property="og:site_name"]', (element: Element) => element.getAttribute('content')]
    ],
    defaultValue: (context: Context) => getProvider(parseUrl(context.url))
  },
};

function getMetadata(doc: Document, location: Location, customRuleSets: RuleSets) {
  const metadata = {} as Record<string, string | string[] | undefined>;
  const context = {
    url: location.href,
  };

  const ruleSets = customRuleSets || metadataRuleSets;

  Object.keys(ruleSets).map(ruleSetKey => {
    const ruleSet = ruleSets[ruleSetKey];
    const builtRuleSet = buildRuleSet(ruleSet);

    metadata[ruleSetKey] = builtRuleSet(doc, context);
  });

  return metadata;
}

export default {
  buildRuleSet,
  getMetadata,
  getProvider,
  metadataRuleSets
};