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

⬇️ (Transition: Player eliminated or Match ends.)
STAGE 3: Game Over & Spectator Mode

 * **Eliminated Player:**
   * **Goal:** Allow eliminated players to remain engaged by observing the rest of the match.
   * **Mechanic:** Upon elimination, players see a brief summary of their performance. They then enter Spectator Mode, attaching their view to the player who eliminated them, and can cycle through spectating any remaining living players. A 'Leave Match' button is available. If the host picks 'Leave Match', a confirmation warning is shown that leaving the match will end the match for all players.
 DESIGN MOCKUP - STAGE 3 (Spectator Overlay) (TBD)

 * **Match End (All but one eliminated):**
   * **Goal:** Report overall match performance and allow the host to initiate the next game.
   * **Mechanic:** When a winner is declared, all players (including the winner and spectators) see a final match summary.
   * **Host Action:** The host's screen will display a prominent "Start Next Game" button. Clicking this button immediately transitions all connected players (winner and spectators) into a new match (STAGE 2: Gameplay), bypassing the lobby.
DESIGN MOCKUP - STAGE 3 (Summary Overlay / Host Controls) (TBD)

⬇️ (Action: Host initiates 'Start Next Game' to begin a new match.)

3. Gameplay Mechanics & Combat
3.1 The Core Loop (Scavenge, Fight, Survive)
 * Deployment: Players drop onto the map with only a basic fist.
 * Scavenge: Acquire Weapons and Armor.
 * Conflict Zone: The boundary shrinks continuously, forcing engagements.
 * Combat: Player vs Player combat using picked-up gear.
 * Victory: Last player standing wins the match.
3.3 The Conflict Zone
 * Pacing: The zone collapse speed increases rapidly after the first 1 minute to ensure an average match time of 5 minutes.
 * Danger: Damage-over-Time (DoT) from the zone increases with each phase.

3.4 Future Considerations
While not part of the initial implementation, the game architecture should be designed to easily accommodate future additions:
 * **Item Tiers:** A tier system (e.g., Common to Legendary) that modifies weapon and armor stats.
 * **Advanced Combat:** More combat options like dual-wielding weapons or using shields.

4. Core Combat Systems
4.1 Weapon Stance
Weapons are classified as either Single or Double handed, which affects their damage output and the player's mobility.
 * **Single:** Standard movement speed and damage.
 * **Double:** Slower movement speed (-15%) but higher base damage (+15%).

4.2 Input Mechanisms (Action RPG Principle, like Diablo Immortal)

The control scheme is designed to be fast and intuitive, prioritizing mobile/touch input first.

 * **Keyboard+Mouse**
   * **Movement:** WASD for 8-directional movement.
   * **Aiming:** The player character aims and attacks towards the mouse cursor's position.
   * **Primary Attack (Left Mouse Button):** Tapping or holding the button executes the equipped weapon's basic attack combo.
   * **Special Ability (Q):** Activates the equipped weapon's unique ability.
   * **Interact (F):** Picks up items or interacts with objects.

 * **Touch**
   * **Movement (Left Thumb):** A dynamic virtual joystick appears on the left side of the screen for movement.
   * **Aiming:** The player attacks in the direction they are currently facing. For aimed special abilities, a drag-and-release mechanic is used.
   * **Primary Attack (Right Thumb):</b> A large button on the right. Tapping or holding it executes the weapon's basic attack combo.
   * **Special Ability Button:** A smaller button near the Primary Attack button. It can be tapped for instant abilities or dragged to aim for skillshots.
   * **Interact:** A context-sensitive button appears over loot, which the player can tap to pick up.

4.3 Western Melee Weapons: Control and Burst
| Weapon | Stance | Target Type | Damage Type | Range | Basic Attack | Speed | Special Ability (Q) |
|---|---|---|---|---|---|---|---|
| Spear | Single | Single | Piercing | Long | 2 short strikes. | Normal | **Lunge:** A forward dash attack. |
| Battle Axe | Single | Multi | Slashing | Medium | 2 wide arcs. | Normal | **Spin Attack:** A 360-degree area attack. |
| Great Axe | Double | Multi | Slashing | Medium | A heavy overhead swing. | Slow | **Whirlwind:** Repeated 360-degree spins (channeled AoE). |
| Great Hammer | Double | Single | Blunt | Medium | A slow, crushing swing. | Slow | **Smash Down:** A high-impact vertical strike that stuns. |

4.4 Eastern Melee Weapons: Speed, Utility, and Mobility
| Weapon | Stance | Target Type | Damage Type | Range | Basic Attack | Speed | Special Ability (Q) |
|---|---|---|---|---|---|---|---|
| Bo | Double | Single | Blunt | Medium | A series of fast jabs. | Fast | **Charged Smack:** Hold Q to twirl and charge, release for a powerful smack with high stun probability. |
| Fist | Single | Single | Blunt | Short | A quick jab. | Fast | **Grab and Throw:** A short-range utility skill to stun and reposition an enemy. |

4.5 Armor Types
Armor provides damage reduction against specific types of attacks. This creates a rock-paper-scissors dynamic with weapons.
| Armor Type | Resists (Good Against) | Weak To (Bad Against) |
| :--- | :--- | :--- |
| **Plated Armor** | `Slashing`, `Piercing` | `Blunt` |
| **Chainmail** | `Slashing` | `Blunt`, `Piercing` |
| **Padded Armor** | (Provides a small, equal reduction to all damage types) | (No specific weakness) |
| **Woven Robes** | `Blunt` | `Slashing`, `Piercing` |

5. Inventory Management
The game uses a slot-based, equipment-only system. There is no separate inventory screen or bag.
  *   **Slots:** Players can equip 1 Weapon and 1 Armor piece.
  *   **Pickup/Replacement:**
    *   If a slot is empty, walking over an item automatically equips it.
    *   If a slot is occupied, walking over a new item prompts the player to manually swap (e.g., "Press F to swap Spear for Axe"). The old item is dropped.

5. Map Design & Loot Distribution
5.1 Map Layout: "The Divide"
 * Division: The map is split into the Western Urban Ruins and the Eastern Natural/Temple Areas.
 * Chokepoints: Bridges and tunnels linking the two zones are critical high-risk, high-reward combat areas.

5.2 Loot Distribution (Scavenging Strategy)
Loot distribution is randomized, but skewed to reward players who venture into high-risk areas.
 * **Dynamic Power Level:** Weapons and Armor have a hidden "Power Level" that determines their stats (e.g., damage, damage reduction).
 * **Geographic Quality:** Loot found closer to the center of the map has a higher chance of having a greater Power Level.
 * **Temporal Quality:** As the Conflict Zone shrinks, the baseline Power Level of all new loot spawns increases. This ensures late-game encounters are appropriately geared.

6. Technical & Audio
6.1 Technical Requirements
 * Movement Model: Fluid, pixel-based movement. There is no underlying grid for movement or object placement.
 * Netcode: High priority on low-latency synchronization (targeting 60 Hz minimum) for a responsive action-RPG combat feel.
 * Input Buffer: Essential single-step buffer for accurate input registration during fast combat.
6.2 Simple Audio
 * Directional Audio: Essential for tracking enemies (footsteps, reloads) due to the lack of Fog of War.
 * Weapon Contrast: Distinct sound profiles for metallic Western vs. organic Eastern weapons.
