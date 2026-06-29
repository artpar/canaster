# Canaster Visual Catalog Follow-up

Date: 2026-06-29

Purpose: capture the preferred direction for Canaster catalog documents. The catalog should be a set of finished, highly visual example workspaces people want to open, inspect, copy, and remix. It should not feel like office templates, dashboards, or empty forms.

## Catalog Frame

Catalog documents should feel like visual atlases and playable knowledge boards.

Good directions:

- maps
- brackets
- timelines
- tier lists
- relationship webs
- tournament ladders
- universe guides
- canon trackers
- watch orders
- rankings
- routes
- complete-guide canvases

Bad directions:

- generic project plans
- admin dashboards
- CRM boards
- blank templates
- office productivity examples
- decorative demos with no real content

The catalog should ship as finished example documents, not forms waiting to be filled.

## Current Constraints

- Use the current primitives first: work item, note, checklist, image, and view.
- Do not add new node types just to make the first catalog pass easier.
- If a document is awkward with current primitives, record that as evidence for future primitives.
- Keep product language practical: workspace, document, view, panel, work item, save, open, account.
- Do not make the app feel like a developer graph tool, BI dashboard, generic whiteboard, or novelty mind-map app.
- For copyrighted universes, avoid shipping exact names/art unless that decision is explicit. We can still create adjacent patterns, such as an anime power atlas or fictional clan-world map.

## Strong Catalog Candidates

### World Cup 2026 Groups And Knockout Ladder

What: a full tournament document covering groups, knockout ladder, venues, dates, and prediction paths.

Visual shape: a large bracket canvas with group boards feeding into Round of 32, Round of 16, quarter-finals, semi-finals, third-place match, and final. Side views can hold stadium maps, favorites routes, and match-day checklists.

Views:

- 12 group boards
- Round of 32 bracket
- knockout path by side
- stadium map
- favorites route guide
- scores and predictions

Why: this is the strongest first catalog document. It validates bracket layouts, lane layouts, dense but readable cards, nested tournament views, and pan/zoom exploration.

Reference: `https://worldcupknockout.football/` shows the desired pattern: groups, knockout rounds, scores, side-by-side bracket navigation, pan/zoom, and predictions.

### Top 100 Movies Visual Canon

What: a ranked movie atlas that maps classics, decades, genres, directors, and watch paths.

Visual shape: a ranked galaxy or wall, with top-level clusters by era and genre, plus nested views for top 10, directors, and watch-next paths.

Views:

- top 10 classics
- decades
- genres
- directors
- watch-next paths
- personal checklist

Why: instantly understandable, highly visual, and remixable. It tests ranking, curation, checklists, and cross-view organization.

### Anime Power World Atlas

What: a fictional anime-style power world map with regions, factions, powers, arcs, rivalries, and battles.

Visual shape: a world map / faction map at the root, with nested views for regions, character arcs, power systems, and battle timelines.

Views:

- villages or factions
- character arcs
- power systems
- battles timeline
- mentor/student graph
- rivalry map

Why: captures the energy of a Naruto-style universe map without requiring shipped copyrighted content. It tests lore maps, relationship webs, nested story arcs, and visual hierarchy.

### Formula 1 Season Command Map

What: a season atlas showing races, circuits, standings, championship scenarios, teams, and rivalries.

Visual shape: a calendar route around the world, with race weekends as nodes and championship scenario views branching from key races.

Views:

- race calendar route
- constructor standings
- driver rivalries
- circuit notes
- championship scenarios
- race weekend checklist

Why: combines sports, geography, calendar, standings, and storylines in a visual format.

### Cinematic Watch Order

What: a large watch-order document for a fictional cinematic universe or public-domain/adapted saga.

Visual shape: a timeline spine with release order, story chronology, character arcs, phases, and skip/watch recommendations.

Views:

- release order
- story chronology
- character arcs
- saga phases
- skip/watch recommendations
- rewatch checklist

Why: tests timeline documents, nested media guides, and personal checklist behavior.

### Football Club Dynasty Board

What: a visual history document for a club, dynasty, or fictional football organization.

Visual shape: a trophy timeline plus eras, managers, squads, transfers, and rivalries.

Views:

- legendary squads
- trophies timeline
- managers
- transfers
- rivalries
- best XI debates

Why: emotional, collectible, and visual. It also tests arguments/debates as workspace content without adding a decision primitive yet.

### 100 Video Games That Changed Everything

What: a timeline and influence atlas for important games.

Visual shape: genre branches growing from a chronological spine, with influence chains and milestone clusters.

Views:

- arcade
- RPG
- shooters
- open world
- indies
- influence chains

Why: strong relationship mapping without becoming a technical graph. It tests rankings, eras, genres, and influence links using current nodes.

### Mythology Universe Map

What: a public-domain-friendly pantheon and story map.

Visual shape: realms, pantheons, family trees, hero journeys, monster clusters, and famous conflicts.

Views:

- Greek gods
- Norse realms
- heroes
- monsters
- family trees
- famous stories

Why: rich, visual, and safer than licensed media. It gives the catalog the same lore-map energy as anime universes while avoiding IP problems.

### Hip-Hop Family Tree

What: a cultural map of scenes, eras, artists, producers, labels, albums, and influence.

Visual shape: city and era clusters connected by influence paths and timeline branches.

Views:

- cities
- labels
- producers
- diss tracks
- classic albums
- influence lines

Why: cultural graph plus timeline plus rankings. It is vivid and non-corporate.

### Space Mission Atlas

What: a solar-system mission map for human and robotic exploration.

Visual shape: planets and mission routes, with timelines for Apollo, Mars missions, probes, telescopes, and future missions.

Views:

- Apollo
- Mars missions
- probes
- telescopes
- future missions
- launch timeline

Why: public factual content, beautiful spatial layout, and a natural fit for nested views.

## Recommended Build Order

1. **World Cup 2026 Groups And Knockout Ladder**
   - Why first: validates bracket, lane, tournament, and dense match-card layouts.

2. **Top 100 Movies Visual Canon**
   - Why second: validates ranking, curation, checklist, and watch-path documents.

3. **Anime Power World Atlas**
   - Why third: validates fictional world maps, factions, character arcs, power systems, and relationship webs.

4. **Mythology Universe Map**
   - Why fourth: similar visual energy to anime lore, but public-domain-safe.

## Naming Direction

Avoid generic names:

- Movie tracker
- Tournament planner
- Anime map template
- Project board

Use finished-document names:

- World Cup 2026 Groups And Knockout Ladder
- Top 100 Movies Visual Canon
- Anime Power World Atlas
- Greek Mythology Family War Map
- Space Mission Atlas

## Quality Bar

Each catalog document should have:

- a strong root composition
- 5-8 top-level view nodes
- at least 2-4 child views with real content
- a mix of work items, notes, checklists, image placeholders, and nested views
- clear spatial structure: lanes, clusters, map zones, timelines, brackets, or rankings
- practical labels that help a user understand the document without instructions
- enough content to feel finished, not skeletal

## Follow-up Work

1. Build the first catalog document as a real JSON starter workspace.
2. Keep the document visually complete before adding a second entry.
3. Record where current primitives feel strained.
4. Use that friction to decide whether future primitives like brackets, rankings, evidence bundles, timelines, or relationship lines deserve first-class support.
