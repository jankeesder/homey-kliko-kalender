Kliko Kalender toont je afvalophaalschema voor de komende 7 dagen, op basis van je adres. Werkt voor alle adressen in Nederland.

Voeg je adres toe via Apparaten om te zien welke containers (GFT, REST, PAP, PMD) vandaag en morgen worden opgehaald. Gebruik de widget op je Homey dashboard voor een snel overzicht, en stel Flows in om een melding te ontvangen op ophaaldagen.

Wat maakt Kliko Kalender anders? Je kunt meerdere adressen toevoegen — elk als eigen tegel in Homey met afzonderlijke meldingen en automatiseringen. Handig als je op een hoek woont waar je containers aan twee kanten opgehaald kunnen worden, of als je meerdere adressen wilt bijhouden.

Voorbeeldflow: dagelijkse meldingen

's Ochtends (8:00):
  Als:  Tijdstip is 8:00
  En:   Ophaling vandaag is Ja → [apparaat]
  Dan:  Stuur een melding → "Vandaag wordt [Ophaaltypen vandaag] opgehaald"

's Avonds (20:00):
  Als:  Tijdstip is 20:00
  En:   Ophaling morgen is Ja → [apparaat]
  Dan:  Stuur een melding → "Morgen wordt [Ophaaltypen morgen] opgehaald"
