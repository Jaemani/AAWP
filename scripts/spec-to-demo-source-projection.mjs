export function projectSpecToDemoSource(source, requestedScreens, sourceByteSha256) {
  if (!Array.isArray(source?.screens)) throw new Error("source spec must contain screens[]");
  const byScreenId = new Map(source.screens.map((screen) => [screen?.id, screen]));
  const screens = requestedScreens.map((screenId) => {
    const screen = byScreenId.get(screenId);
    if (screen === undefined) throw new Error(`source spec has no requested screen: ${screenId}`);
    return screen;
  });

  const actorIds = new Set(screens.flatMap((screen) => screen.actors ?? []));
  const componentNames = new Set(screens.flatMap((screen) => screen.components ?? []));
  const interactions = Array.isArray(source.interactionModel)
    ? source.interactionModel.filter((interaction) =>
        requestedScreens.includes(interaction?.screenId)
      )
    : [];

  return {
    schemaVersion: "aawp/spec-to-demo-source-projection/v1",
    projection: {
      sourceByteSha256,
      requestedScreens,
      includedSections: ["meta", "actors", "components", "interactionModel", "screens"]
    },
    meta: {
      scenario: source.meta?.scenario,
      stack: source.meta?.stack,
      chosenDirection: source.meta?.chosenDirection
    },
    actors: Array.isArray(source.actors)
      ? source.actors.filter((actor) => actorIds.has(actor?.id))
      : [],
    components: Array.isArray(source.components)
      ? source.components.filter((component) => componentNames.has(component?.name))
      : [],
    interactionModel: interactions,
    screens
  };
}
