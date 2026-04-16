Kliko Calendar shows your trash collection schedule for the next 7 days, based on your address. Works for all addresses in the Netherlands.

Add your address via Devices to see which containers (GFT, REST, PAP, PMD) are collected today and tomorrow. Use the widget on your Homey dashboard for a quick overview, and set up Flows to get notified on collection days.

What makes Kliko Calendar different? You can add multiple addresses — each as its own tile in Homey with separate notifications and automations. Perfect if you live on a corner where your bins can be collected from either side, or if you want to track collection at multiple properties.

Example flow: daily collection reminders
──────────────────────────────────────────
Morning (8:00 AM):
  When: Time is 8:00 AM
  And:  Collection today is Yes → [device]
  Then: Send a notification → "Collected today: [Collection types today]"

Evening (8:00 PM):
  When: Time is 8:00 PM
  And:  Collection tomorrow is Yes → [device]
  Then: Send a notification → "Collected tomorrow: [Collection types tomorrow]"
