Game Design Document: Conflict Zone: East vs West
Date: December 16, 2025
Genre: Multiplayer, Battle Royale, Top-Down Shooter
Perspective: 2D Top-Down (Pixel Art)
Theme: Post-Conflict East vs. West / Asymmetric Gear Combat
1. Executive Summary
Conflict Zone: East vs West is a 12-player Battle Royale built on a classic 2D top-down pixel art engine. The core challenge lies in mastering the gear sets of different weapon types (East vs West). The gameplay uses action-rpg controls, for mobile/touch first, and keyboard-mouse support. Matches are fast-paced, lasting approximately 5 minutes due to the constantly shrinking "Conflict Zone."
2. Game Flow Loop & Visual Mocks
(Note on Mocks: Visual descriptions focus on clarity and high-contrast pixel graphics. Final style: High-fidelity pixel art with distinct faction color palettes.)
STAGE 1: Lobby & Intro Screen (Intro Screen)
 * Goal: Allow players to see input instructions, and either host a game (thus getting a join code), or join a game with a given join code.

DESIGN MOCKUP - STAGE 1 (Lobby) (TBD)

⬇️ (Transition: Cinematic drop sequence over the map.)
STAGE 2: Gameplay & Combat
 * Goal: Survive, scavenge weapons and armor, fight other players, pick up their weapons/armor
DESIGN MOCKUP - STAGE 2 (2D Gameplay) (TBD)

⬇️ (Transition: Screen freeze. Final kill is highlighted. Summary overlay slides in.)
STAGE 3: Game Over (Summary Screen)
 * Goal: Report performance and encourage immediate...what? how does this work in a hosted game?
DESIGN MOCKUP - STAGE 3 (Summary Overlay) (TBD)
⬇️ (Action: Player returns to Lobby/Queue.)

3. Gameplay Mechanics & Combat
3.1 The Core Loop (Scavenge, Fight, Survive)
 * Deployment: Players drop onto the map with only a basic fist.
 * Scavenge: Acquire Weapons, Armor, and Utility items (categorized into Tiers 1-5).
 * Conflict Zone: The boundary shrinks continuously, forcing engagements.
 * Combat: Player vs Player combat using picked-up gear.
 * Victory: Last player standing wins the match.
3.3 The Conflict Zone
 * Pacing: The zone collapse speed increases rapidly after the first 1 minute to ensure an average match time of 5 minutes.
 * Danger: Damage-over-Time (DoT) from the zone increases with each phase.
4 Input Mechanisms (Action RPG Principle, like Diable Immortal)
 * Keyboard+Mouse
   * Movement: WASD (Fluid, pixel-based, not tile-locked).
   * Mouse: TODO: fill this out like Diablo Immortal
 * Touch
   * Movement: dynamic joystick
   * Touch: TODO: fill this out like Diablo Immportal
4.2 Western Melee Weapons: Control and Burst
| Weapon | Stance | Target Type | Damage Type | Range | Attack Combo / Mechanic | Speed |
|---|---|---|---|---|---|---|
| Spear | Single | Single | Piercing | Long | 2 short strikes + Lunge (forward dash attack). | Normal |
| Battle Axe | Single | Multi | Slashing | Medium | 2 wide arcs + 360-degree spin attack. | Normal |
| Great Axe | Double | Multi | Slashing | Medium | Repeated 360-degree spins (sustained AoE). | Slow |
| Great Hammer | Double | Single | Blunt | Medium | Smash Down (Vertical, high-impact strike). | Slow |
4.3 Eastern Melee Weapons: Speed, Utility, and Mobility
| Weapon | Stance | Target Type | Damage Type | Range | Attack Combo / Mechanic | Speed | Special Feature |
|---|---|---|---|---|---|---|---|
| Bo | Double | Single | Blunt | Medium | Hold Twirl (Charge up) + released Smack. | Fast | High stun probability. |
| Fist | Single | Single | Blunt | Short | Single attack. | Fast | Unlocks the Grab and Throw utility (brief stun/reposition). |
5. Inventory Management
  * TODO: simple inventory management, one weapon, one armor, that can be replaced
5. Map Design & Loot Distribution
5.1 Map Layout: "The Divide"
 * Division: The map is split into the Western Urban Ruins and the Eastern Natural/Temple Areas.
 * Chokepoints: Bridges and tunnels linking the two zones are critical high-risk, high-reward combat areas.
5.2 Loot Distribution (Scavenging Strategy)
 * W-Zone Bias: Higher spawn rates for Western gear (ARs, Plated Armor, EMP Grenades).
 * E-Zone Bias: Higher spawn rates for Eastern gear (Bows, Healing Items, Smoke Veils).
 * Airdrops: Mid-game events drop high-tier (T4/T5) loot that is faction-neutral or provides Legendary gear, forcing conflicts between players seeking a power spike.
6. Technical & Audio
6.1 Technical Requirements
 * Movement Model: Fluid pixel movement on a grid framework.
 * Netcode: High priority on low-latency synchronization (targeting 60 Hz minimum) for precise twin-stick aiming.
 * Input Buffer: Essential single-step buffer for accurate input registration during fast combat.
6.2 Simple Audio
 * Directional Audio: Essential for tracking enemies (footsteps, reloads) due to the lack of Fog of War.
 * Weapon Contrast: Distinct sound profiles for metallic Western guns vs. organic Eastern projectiles (e.g., twang of a bow, whoosh of elemental fire).
