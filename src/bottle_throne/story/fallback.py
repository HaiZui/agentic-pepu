"""Template scenes and texts built from the fate script alone, used when the LLM is unavailable or fails."""

from dataclasses import dataclass, field

from bottle_throne.fate.catalog import ARCHETYPE_LABELS
from bottle_throne.fate.rng import Stream
from bottle_throne.models.fate import Beat, FateScript
from bottle_throne.models.story import (
    ActTitles,
    BeatSynopsis,
    Caption,
    ChronicleTexts,
    Cue,
    Line,
    Onomatopoeia,
    PanelMoment,
    SceneScript,
    ShowBible,
    StageDirection,
)
from bottle_throne.story.bible import default_exit_reason, default_motivation, default_threads, participant_exits
from bottle_throne.story.catalog import NARRATOR, reading_seconds
from bottle_throne.story.causes import dragon_resolution, wording_key
from bottle_throne.story.storyline import storyline

FALLBACK_VERSION = "fallback-1"

# (speaker role key or "narrator", emotion, action, text). Role keys repeat with a suffix: ally, ally2.
L = tuple[str, str, str | None, str]


@dataclass(frozen=True)
class Variant:
    music: str
    caption: str
    lines: tuple[L, ...]
    sfx: tuple[tuple[str, int], ...] = ()
    sound: tuple[tuple[str, int], ...] = ()
    framings: tuple[str, str, str] = ("wide", "medium", "close_up")


def V(music: str, caption: str, *lines: L, sfx=(), sound=(), framings=("wide", "medium", "close_up")) -> Variant:
    return Variant(music, caption, lines, tuple(sfx), tuple(sound), framings)


N = NARRATOR
TEMPLATES: dict[str, list[Variant]] = {
    "dragon_victory": [
        V("battle", "ONE HERO. ONE DRAGON.",
          ("hero", "furious", "draw_weapon", "I challenge you! Please ignore my shaking knees."),
          ("hero", "triumphant", "strike", "For the bottle!"),
          sfx=(("dragon_roar", 0), ("sword_clash", 1)), framings=("wide", "wide", "wide")),
        V("battle", "A VERY LARGE OBSTACLE.",
          ("hero", "terrified", "draw_weapon", "Nobody mentioned the wings."),
          ("hero", "triumphant", "strike", "Paper beats dragon!"),
          sfx=(("dragon_roar", 0), ("sword_clash", 1)), framings=("wide", "wide", "wide")),
    ],
    "dragon_defeat:dragon_slaying": [
        V("battle", "ONE HERO. ONE DRAGON.",
          ("hero", "terrified", "draw_weapon", "That is rather more dragon than I expected."),
          ("hero", "terrified", None, "I may have underestimated the teeth."),
          sfx=(("dragon_roar", 0), ("thud", 1)), framings=("wide", "wide", "wide")),
        V("battle", "THE DRAGON ACCEPTS.",
          ("hero", "furious", "draw_weapon", "Stand back! I have a plan."),
          ("hero", "terrified", None, "The plan needed a smaller dragon."),
          sfx=(("dragon_roar", 0), ("thud", 1)), framings=("wide", "wide", "wide")),
    ],
    "dragon_defeat:sword_accident": [
        V("battle", "ONE HERO. ONE DRAGON.",
          ("hero", "smug", "draw_weapon", "Watch my flawless footwork!"),
          ("hero", "terrified", None, "Who put my feet there?"),
          sfx=(("dragon_roar", 0), ("thud", 1)), framings=("wide", "wide", "wide")),
        V("battle", "MIND YOUR STEP.",
          ("hero", "smug", "draw_weapon", "First, a magnificent entrance."),
          ("hero", "terrified", None, "No, sword! The OTHER direction!"),
          sfx=(("dragon_roar", 0), ("thud", 1)), framings=("wide", "wide", "wide")),
    ],
    "cold_open": [
        V("overture", "A KINGDOM HOLDS ITS BREATH...",
          (N, "neutral", None, "Hear ye! The bottle awaits a worthy hand."),
          ("old_king", "smug", "point", "I am {old_king}, and this throne is still warm."),
          ("announcer", "neutral", None, "Let the peasants step forward!"),
          sfx=(("curtain", 0), ("horn", 2)), framings=("wide", "close_up", "medium")),
        V("overture", "ONCE UPON A FRIDAY...",
          (N, "neutral", None, "In a realm of dust and ambition, a crown gathers dust."),
          ("old_king", "scheming", None, "Who dares to want my bottle? Come, then."),
          sfx=(("curtain", 0), ("gong", 1))),
    ],
    "decree": [
        V("intrigue", "BY ROYAL DECREE",
          ("announcer", "neutral", None, "Silence for the crown!"),
          ("old_king", "smug", "point", "Only one of you shall wear it. Begin!"),
          (N, "neutral", None, "Somewhere, a goat bleats ominously."),
          sfx=(("horn", 0),)),
        V("intrigue", "THE THRONE ROOM",
          ("old_king", "furious", None, "New rules: no sulking, no mercy, no refunds."),
          (N, "neutral", None, "Nobody dares to ask what the old rules were."),
          sfx=(("gong", 0),)),
    ],
    "prophecy": [
        V("dread", "A VOICE FROM THE SMOKE...",
          ("seer", "scheming", None, "Hear the prophecy, little ones!"),
          ("seer", "terrified", None, "{hint1}..."),
          ("seer", "terrified", None, "{hint2}..."),
          ("listener", "terrified", None, "That could be anyone!"),
          sfx=(("wind", 0), ("bell_toll", 1))),
        V("dread", "THE SEER SPEAKS",
          (N, "neutral", None, "The candles gutter. The seer's eyes roll back."),
          ("seer", "terrified", None, "{hint1}. {hint2}."),
          ("listener", "smug", None, "Clearly it means me."),
          sfx=(("thunder", 1),), sound=(("KRAKOOM!", 1),)),
    ],
    "sworn_alliance": [
        V("intrigue", "AN ALLIANCE IS SWORN",
          ("ally", "scheming", None, "Together we rise, {ally2}."),
          ("ally2", "smug", "embrace", "Together. Until it is inconvenient."),
          (N, "neutral", None, "They shake on it. Both count their fingers after."),
          sfx=(("goblet_clink", 1),)),
        V("intrigue", "UNDER THE SAME BANNER",
          ("ally2", "neutral", None, "My sword is yours, {ally}."),
          ("ally", "triumphant", "embrace", "And mine is... somewhere near yours."),
          sfx=(("sword_draw", 0),)),
    ],
    "knife_in_the_back": [
        V("dread", "A KNIFE IN THE BACK",
          ("victim", "smug", None, "Watch my back, friend."),
          ("betrayer", "scheming", "strike", "Oh, I am watching it closely."),
          (N, "neutral", None, "{victim}'s rod snaps. The alliance is over."),
          sfx=(("shink", 1),), sound=(("SHINK!", 1),), framings=("medium", "close_up", "extreme_close_up")),
        V("dread", "BETRAYAL!",
          ("betrayer", "smug", "draw_weapon", "Nothing personal, {victim}."),
          ("victim", "terrified", None, "It feels VERY personal!"),
          sfx=(("sword_draw", 0), ("thud", 1)), sound=(("SHUNK!", 0),)),
    ],
    "knife_foiled": [
        V("dread", "A KNIFE IN THE DARK...",
          ("betrayer", "scheming", "strike", "Goodnight, sweet ally."),
          ("victim", "furious", None, "Not tonight, traitor!"),
          (N, "neutral", None, "The blade bounces off a lucky belt buckle."),
          sfx=(("sword_clash", 1),), sound=(("KLANG!", 1),)),
        V("dread", "FOILED!",
          ("victim", "smug", "point", "I saw that coming, {betrayer}."),
          ("betrayer", "terrified", "flee", "Saw what? I was... sharpening a spoon."),
          sfx=(("crowd_gasp", 0),)),
    ],
    "trial_by_combat": [
        V("battle", "TRIAL BY COMBAT",
          ("challenger", "furious", "draw_weapon", "Let the gods decide, {fallen}!"),
          ("fallen", "smug", "draw_weapon", "The gods owe me money."),
          (N, "neutral", None, "The gods do not pay. {fallen} goes down."),
          sfx=(("sword_draw", 0), ("sword_clash", 1)), sound=(("CLANG!", 1),),
          framings=("wide", "medium", "splash")),
        V("battle", "STEEL DECIDES",
          ("fallen", "furious", "strike", "Have at thee!"),
          ("challenger", "triumphant", "strike", "Have at thee harder!"),
          sfx=(("sword_clash", 0), ("crowd_cheer", 1)), sound=(("KRANG!", 1),)),
    ],
    "poisoned_goblet": [
        V("feast", "A TOAST!",
          ("poisoner", "smug", None, "A toast to you, {victim}!"),
          ("victim", "triumphant", "drink", "How kind! It tastes of almonds."),
          (N, "neutral", None, "The goblet rolls across the table."),
          sfx=(("goblet_clink", 0), ("gulp", 1)), sound=(("GLUG!", 1),)),
        V("feast", "THE FEAST GROWS QUIET",
          ("victim", "neutral", "drink", "Strange vintage..."),
          ("poisoner", "scheming", None, "Very rare. Very final."),
          sfx=(("gulp", 0), ("crowd_gasp", 1))),
    ],
    "poisoned_goblet:poisoner_drank": [
        V("feast", "THE GOBLETS ARE SWAPPED",
          ("poisoner", "scheming", None, "This cup is for you, {intended}."),
          ("intended", "smug", None, "How generous. Let us swap, for luck."),
          ("poisoner", "terrified", "drink", "Swap? Oh. Oh no."),
          sfx=(("goblet_clink", 1), ("gulp", 2)), sound=(("GULP!", 2),)),
        V("feast", "OOPS.",
          ("poisoner", "smug", "drink", "Cheers, everyone!"),
          ("intended", "neutral", None, "Wasn't that the cup you poured for me?"),
          sfx=(("gulp", 0),)),
    ],
    "taster_falls": [
        V("feast", "THE FOOD TASTER EARNS HIS WAGE",
          ("taster", "neutral", "drink", "Just a sip, for safety."),
          ("intended", "terrified", None, "Is it... safe?"),
          (N, "neutral", None, "Someone was trying very hard to poison {intended}."),
          sfx=(("gulp", 0), ("thud", 2)), sound=(("THUD!", 2),)),
        V("feast", "A SIP TOO FAR",
          ("taster", "smug", "drink", "Delicious. Slightly lethal."),
          ("intended", "grieving", None, "We will remember your tongue."),
          sfx=(("gulp", 0),)),
    ],
    "grey_cloak": [
        V("winter", "TAKING THE GREY CLOAK",
          ("deserter", "grieving", None, "I renounce the crown. The Wall needs me."),
          (N, "neutral", None, "{deserter} walks north, wrapped in grey."),
          sfx=(("wind", 0),)),
        V("winter", "THE GREY CLOAKS CALL",
          ("deserter", "terrified", None, "On second thought, the cold sounds nice."),
          (N, "neutral", None, "And so {deserter} leaves the game for good."),
          sfx=(("horn", 1),)),
    ],
    "faceless_contract": [
        V("intrigue", "A COIN FOR THE FACELESS",
          ("client", "scheming", None, "One name. One coin. No questions."),
          (N, "neutral", None, "The name on the parchment reads: {target}."),
          sfx=(("bell_toll", 1),)),
        V("intrigue", "IN THE DARKEST ALLEY",
          ("client", "smug", "point", "Take care of {target} for me."),
          ("target", "neutral", None, "Did anyone else feel a chill?"),
          sfx=(("raven", 0),)),
    ],
    "faceless_strike": [
        V("dread", "THE FACELESS STRIKE",
          ("target", "smug", None, "I fear no shadows."),
          (N, "neutral", None, "A shadow politely disagrees. {target} is out."),
          sfx=(("shink", 1),), sound=(("SNIKT!", 1),)),
        V("dread", "A DEBT IS COLLECTED",
          ("client", "scheming", None, "Money well spent."),
          ("target", "terrified", None, "Who is standing behind me?"),
          sfx=(("heartbeat", 0), ("shink", 1)), sound=(("SHINK!", 1),)),
    ],
    "dragon_egg": [
        V("intrigue", "A WARM EGG",
          ("bearer", "triumphant", None, "A dragon egg! Nobody touch me for a while."),
          (N, "neutral", None, "The egg hums. Nobody touches {bearer}."),
          sfx=(("dragon_roar", 1),), sound=(("RAWR!", 1),)),
        V("intrigue", "THE EGG CHOOSES",
          ("bearer", "terrified", None, "It is... moving?"),
          (N, "neutral", None, "For now, the egg protects {bearer}."),
          sfx=(("heartbeat", 0),)),
    ],
    "old_kings_pardon": [
        V("intrigue", "ROYAL MERCY",
          ("old_king", "smug", "point", "{pardoned}, I pardon you. For now."),
          ("pardoned", "grieving", "kneel", "Your Majesty is too kind."),
          sfx=(("gong", 0),)),
        V("intrigue", "A WHIM OF THE CROWN",
          ("old_king", "neutral", None, "I am feeling generous. Rise, {pardoned}."),
          ("pardoned", "terrified", None, "Thank you? I think?"),
          sfx=(("horn", 0),)),
    ],
    "old_kings_gambit": [
        V("intrigue", "THE OLD KING'S GAMBIT",
          ("old_king", "scheming", "point", "{banished}, you are banished. Today."),
          ("banished", "furious", None, "You cannot do this!"),
          ("old_king", "smug", None, "Crown says I can."),
          sfx=(("gong", 0), ("crowd_gasp", 1))),
        V("intrigue", "EXILE!",
          ("old_king", "furious", None, "Out of my sight, {banished}!"),
          ("banished", "grieving", None, "I was only asking about the bottle."),
          sfx=(("bell_toll", 0),)),
    ],
    "iron_vault_debt": [
        V("intrigue", "THE IRON VAULT COLLECTS",
          (N, "neutral", None, "The Iron Vault sends its regards, and its bill."),
          ("debtor", "terrified", None, "Can I pay in compliments?"),
          (N, "neutral", None, "{debtor} is escorted to the harbor. One way."),
          sfx=(("horn", 0), ("splash", 2))),
        V("intrigue", "DEBTS ARE PAID",
          ("debtor", "grieving", None, "I only borrowed a little crown money."),
          (N, "neutral", None, "The Vault exiles {debtor} with interest."),
          sfx=(("bell_toll", 1),)),
    ],
    "debt_paid": [
        V("intrigue", "A FRIEND IN NEED",
          ("debtor", "terrified", None, "The Iron Vault wants its gold!"),
          ("payer", "smug", None, "Here. Now you owe me instead."),
          sfx=(("goblet_clink", 1),)),
        V("intrigue", "GOLD CHANGES HANDS",
          ("payer", "neutral", None, "Consider it paid, {debtor}."),
          ("debtor", "triumphant", "embrace", "I will never forget this!"),
          sfx=(("crowd_cheer", 1),)),
    ],
    "near_miss": [
        V("intrigue", "A CLOSE CALL",
          (N, "neutral", None, "A falling gargoyle misses {survivor} by a hair."),
          ("survivor", "terrified", "flee", "I meant to do that!"),
          sfx=(("thud", 0),), sound=(("WHOOSH!", 0),)),
        V("intrigue", "NOT TODAY",
          ("survivor", "smug", None, "Ha! Missed me!"),
          (N, "neutral", None, "The arrow quivers in the post behind {survivor}."),
          sfx=(("thud", 1),), sound=(("THWOK!", 1),)),
    ],
    "wound": [
        V("battle", "BLOOD IS DRAWN",
          ("attacker", "furious", "strike", "Take that!"),
          ("wounded", "terrified", None, "Ow! That is my good arm!"),
          sfx=(("sword_clash", 0),), sound=(("SLASH!", 0),)),
        V("battle", "A GRIEVOUS WOUND",
          ("wounded", "grieving", "kneel", "It is only a flesh wound."),
          ("attacker", "smug", None, "It is quite a lot of flesh."),
          sfx=(("thud", 0),)),
    ],
    "red_priestess": [
        V("dread", "THE RED PRIESTESS PRAYS",
          (N, "neutral", None, "Flames rise. The Red Priestess whispers old words."),
          ("risen", "terrified", "enter", "I... was dead? Did I miss lunch?"),
          sfx=(("fire_whoosh", 0), ("choir", 1)), sound=(("FWOOOM!", 0),),
          framings=("wide", "splash", "close_up")),
        V("dread", "BACK FROM THE DARK",
          ("risen", "furious", "enter", "Death could not hold me!"),
          (N, "neutral", None, "{risen} walks again. Several people faint."),
          sfx=(("choir", 0), ("crowd_gasp", 1))),
    ],
    "final_duel": [
        V("battle", "THE LAST DUEL",
          ("rival", "furious", "draw_weapon", "Only one of us leaves this place, {champion}."),
          ("champion", "smug", "strike", "Then I will hold the door for you."),
          (N, "neutral", None, "Steel rings. The rival's rod snaps. It is over."),
          sfx=(("sword_draw", 0), ("sword_clash", 1)), sound=(("KRAKOOM!", 1),),
          framings=("wide", "close_up", "splash")),
        V("battle", "FACE TO FACE",
          ("champion", "furious", "draw_weapon", "For the bottle!"),
          ("rival", "terrified", "strike", "For... also the bottle!"),
          sfx=(("sword_clash", 1), ("crowd_gasp", 1)), sound=(("CLANG!", 1),),
          framings=("medium", "close_up", "splash")),
    ],
    "final_duel:yielded": [
        V("battle", "THE LAST STANDOFF",
          ("rival", "terrified", None, "On reflection, {champion}, the crown suits you."),
          ("champion", "triumphant", "point", "A wise choice. Go in peace."),
          sfx=(("wind", 0), ("crowd_cheer", 1))),
        V("battle", "SURRENDER!",
          ("champion", "furious", "draw_weapon", "Yield, {rival}!"),
          ("rival", "grieving", "kneel", "I yield! I yield!"),
          sfx=(("sword_draw", 0),), sound=(("SHING!", 0),)),
    ],
    "coronation": [
        V("triumph", "LONG LIVE THE MONARCH!",
          (N, "neutral", None, "And so the prophecy is fulfilled."),
          ("crowned", "triumphant", "crown", "The bottle is mine!"),
          ("old_king", "grieving", "kneel", "Take good care of it."),
          sfx=(("choir", 0), ("crowd_cheer", 1)), sound=(("HUZZAH!", 1),),
          framings=("wide", "splash", "close_up")),
        V("triumph", "A NEW REIGN BEGINS",
          ("crowned", "triumphant", "crown", "As the prophecy foretold!"),
          (N, "neutral", None, "The realm cheers. The bottle gleams."),
          sfx=(("horn", 0), ("crowd_cheer", 1)), framings=("splash", "wide", "close_up")),
    ],
}

CROWD_TEMPLATES: dict[str, list[Variant]] = {
    "grey_plague": [
        V("dread", "THE GREY PLAGUE", (N, "neutral", None, "A grey cough sweeps the streets."),
          (N, "grieving", None, "{fallen} are carried away."),
          ("survivor", "terrified", None, "Nobody breathe on me!"),
          sfx=(("bell_toll", 0),)),
        V("dread", "BRING OUT YOUR PEASANTS", (N, "neutral", None, "The bells toll for {count}."),
          (N, "grieving", None, "{fallen} will not see the crown."),
          sfx=(("bell_toll", 0), ("crowd_gasp", 1))),
    ],
    "muddy_field_battle": [
        V("battle", "BATTLE OF THE MUDDY FIELD",
          ("commander", "furious", "draw_weapon", "Charge!"),
          ("commander2", "furious", "draw_weapon", "No, YOU charge!"),
          (N, "neutral", None, "When the mud settles, {fallen} are gone."),
          sfx=(("horn", 0), ("sword_clash", 1)), sound=(("SPLORCH!", 2),),
          framings=("wide", "medium", "splash")),
        V("battle", "MUD AND BANNERS",
          (N, "neutral", None, "Two banners, one very muddy field."),
          ("commander", "triumphant", "strike", "Hold the line!"),
          (N, "grieving", None, "{fallen} fall in the muck."),
          sfx=(("sword_clash", 1), ("thud", 2))),
    ],
    "crimson_feast": [
        V("feast", "THE CRIMSON FEAST", ("host", "smug", None, "Welcome, friends! Lock the doors."),
          (N, "neutral", None, "The music stops. The doors do not open."),
          (N, "grieving", None, "{fallen} never leave the hall."),
          sfx=(("goblet_clink", 0), ("crowd_gasp", 1)), framings=("wide", "close_up", "splash")),
        V("feast", "A WEDDING TO REMEMBER", ("host", "scheming", "point", "Play the special song."),
          (N, "grieving", None, "{fallen} realise too late what it means."),
          sfx=(("bell_toll", 0),)),
    ],
    "wildfire": [
        V("battle", "WILDFIRE BELOW THE CITY", (N, "neutral", None, "Green fire bursts from the cellars."),
          (N, "grieving", None, "{fallen} are lost in the blaze."),
          ("survivor", "terrified", "flee", "Run!"),
          sfx=(("fire_whoosh", 0),), sound=(("FWOOSH!", 0),), framings=("splash", "wide", "close_up")),
        V("battle", "THE GREEN GLOW", (N, "neutral", None, "Someone left a candle near the wildfire jars."),
          (N, "grieving", None, "{fallen}: gone in a green flash."),
          sfx=(("fire_whoosh", 1),), sound=(("KA-BLAM!", 1),)),
    ],
    "march_of_pale_ones": [
        V("winter", "MARCH OF THE PALE ONES", (N, "neutral", None, "Blue eyes glow beyond the ice wall."),
          (N, "grieving", None, "The cold takes {fallen}."),
          ("survivor", "terrified", "flee", "I am not built for winter!"),
          sfx=(("wind", 0), ("horn", 1))),
        V("winter", "WINTER CAME", (N, "neutral", None, "Snow falls. Then the Pale Ones fall upon them."),
          (N, "grieving", None, "{fallen} vanish in the white."),
          sfx=(("wind", 0),)),
    ],
    "bridge_gives_way": [
        V("intrigue", "THE BRIDGE GIVES WAY", (N, "neutral", None, "The rope bridge creaks. Then it does not."),
          (N, "grieving", None, "{fallen} drop into the gorge."),
          sfx=(("thud", 1),), sound=(("SNAP!", 0),)),
        V("intrigue", "MIND THE GAP", ("survivor", "smug", None, "After you, everyone."),
          (N, "grieving", None, "{fallen} trust the bridge. The bridge betrays them."),
          sfx=(("splash", 1),), sound=(("SPLOOSH!", 1),)),
    ],
    "grey_cloak_mutiny": [
        V("winter", "MUTINY OF THE GREY CLOAKS", (N, "neutral", None, "The Grey Cloaks need volunteers."),
          (N, "grieving", None, "{fallen} take the grey and march north."),
          sfx=(("horn", 0),)),
        V("winter", "NORTHWARD", (N, "neutral", None, "A recruiter with a big smile arrives."),
          (N, "neutral", None, "{fallen} sign up before reading the small print."),
          sfx=(("wind", 1),)),
    ],
    "kingsmoot_exile": [
        V("intrigue", "THE KINGSMOOT", (N, "neutral", None, "The kingsmoot votes. The votes are... creative."),
          (N, "grieving", None, "{fallen} are exiled by acclamation."),
          sfx=(("crowd_gasp", 1),)),
        V("intrigue", "VOTED OFF THE ISLAND", (N, "neutral", None, "Stones are counted. Feelings are hurt."),
          (N, "grieving", None, "{fallen} must leave the realm."),
          sfx=(("gong", 1),)),
    ],
}

MISSING_ROLE_TEXT = {
    "client": "a hidden hand",
    "seer": "the seer",
    "announcer": "the herald",
    "survivor": "a lucky peasant",
    "commander2": "the other commander",
    "old_king": "the old crown",
}

# Short reactions for contestants planned into a scene without a role (all under 60 characters).
BYSTANDER_LINES = [
    ("terrified", "I saw nothing. I will remember everything."),
    ("smug", "And this is why I never sit near the door."),
    ("neutral", "Somebody should write this down."),
    ("scheming", "Interesting. Very, very interesting."),
    ("terrified", "Is it always like this around here?"),
    ("smug", "I would have done it with more style."),
]
# The planned ghost watches the one who caused their exit leave the story.
GHOST_LINES = [
    "I told you I would see this.",
    "Now we are even.",
    "Mind the step. I did not.",
]
NAMING_TEXT = {
    "killed": "{name} falls, and is out of the contest.",
    "exiled": "{name} is exiled, and out of the contest.",
    "forfeited": "{name} gives up the crown, and leaves the contest.",
}


def _short_list(names: list[str]) -> str:
    if len(names) <= 2:
        return " and ".join(names)
    return f"{names[0]}, {names[1]} and {len(names) - 2} more"


def _role_map(beat: Beat) -> dict[str, str]:
    """Role key -> character id. Repeated roles get suffixes: ally, ally2, commander, commander2."""
    mapping: dict[str, str] = {}
    for role in beat.roles:
        key = role.role
        n = 2
        while key in mapping:
            key = f"{role.role}{n}"
            n += 1
        mapping[key] = role.character
    return mapping


def _variant_key(beat: Beat) -> str:
    for fact in ("poisoner_drank", "yielded"):
        if fact in beat.facts and f"{beat.card}:{fact}" in TEMPLATES:
            return f"{beat.card}:{fact}"
    return beat.card


def variants_for(beat: Beat) -> list[Variant]:
    if beat.card in ("dragon_victory", "dragon_defeat"):
        return TEMPLATES[wording_key(beat)]
    return CROWD_TEMPLATES.get(beat.card) or TEMPLATES[_variant_key(beat)]


def fallback_scene(fate: FateScript, beat: Beat, seed: str, variant: int | None = None) -> SceneScript:
    """A deterministic template scene that satisfies every scene validation rule."""
    names = {c.id: c.name for c in fate.characters}
    roles = _role_map(beat)
    options = variants_for(beat)
    chosen = options[variant if variant is not None else Stream(seed, f"fallback:{beat.index}").uniform_int(len(options))]
    resolution = dragon_resolution(fate, beat)

    victims = [e.character for e in beat.eliminations]
    prophecy = next((b for b in fate.beats if b.card == "prophecy"), None)
    hints = [h.text for h in (prophecy.prophecy_hints if prophecy else [])] + ["One shall rise", "and one shall reign"]
    values = {key: names[cid] for key, cid in roles.items()}
    for key, text in MISSING_ROLE_TEXT.items():
        values.setdefault(key, text)
    values.update(
        {
            "fallen": _short_list([names[v] for v in victims]),
            "count": f"{len(victims)} souls",
            "old_king": names[fate.old_king],
            "hint1": hints[0],
            "hint2": hints[1],
        }
    )
    lines: list[Line] = []
    for speaker_key, emotion, action, text in chosen.lines:
        speaker = roles.get(speaker_key, NARRATOR) if speaker_key != NARRATOR else NARRATOR
        if speaker in victims and action in ("fall", "exit"):
            action = None
        lines.append(Line(speaker=speaker, emotion=emotion, action=action, text=text.format(**values)))  # type: ignore[arg-type]

    plan = storyline(fate).beats[beat.index]
    bystander_lines = [
        Line(speaker=who, emotion=emotion, action=None, text=text)  # type: ignore[arg-type]
        for i, who in enumerate(plan.bystanders)
        for emotion, text in [Stream(seed, f"fallback:bystander:{beat.index}:{i}").choice(BYSTANDER_LINES)]
    ]
    if plan.ghost:
        bystander_lines = [
            Line(speaker=NARRATOR, emotion="neutral", action=None, text=f"The ghost of {names[plan.ghost]} has come to watch."),
            Line(speaker=plan.ghost, emotion="dead", action=None, text=Stream(seed, f"fallback:ghost:{beat.index}").choice(GHOST_LINES)),
        ] + bystander_lines

    def naming(core: list[Line]) -> list[Line]:
        """A narrator line naming the one character who leaves, if the template never names them."""
        if len(beat.eliminations) != 1:
            return []
        (gone,) = beat.eliminations
        name = names[gone.character]
        if any(name.lower() in t.lower() for t in [x.text for x in core] + [chosen.caption]):
            return []
        text = NAMING_TEXT[gone.mode].format(name=name)
        if text.startswith("the "):
            text = "The" + text[3:]
        return [Line(speaker=NARRATOR, emotion="neutral", action=None, text=text)]

    def seconds(core: list[Line]) -> float:
        everything = core + naming(core) + bystander_lines
        return (sum(reading_seconds(x.text) for x in everything) + reading_seconds(chosen.caption)
                + (reading_seconds(resolution) if resolution else 0))

    while len(lines) > 2 and seconds(lines) > beat.budget_seconds:
        lines.pop(-2)
    lines += naming(lines)

    # Cues, directions and panels stay on the template lines; bystanders react at the end.
    last = len(lines) - 1
    lines += bystander_lines
    directions = [
        StageDirection(character=e.character, action="fall" if e.mode == "killed" else "exit", line=last)
        for e in beat.eliminations
    ]
    focus = [line.speaker for line in lines[: last + 1] if line.speaker != NARRATOR]
    panels = [PanelMoment(framing=chosen.framings[0], ref_kind="caption", ref_index=0, focus=focus[:3])]  # type: ignore[arg-type]
    for i, framing in enumerate(chosen.framings[1:], start=1):
        ref = min(i, last) if i < 2 else last
        speaker = lines[ref].speaker
        panels.append(
            PanelMoment(framing=framing, ref_kind="line", ref_index=ref, focus=[] if speaker == NARRATOR else [speaker])  # type: ignore[arg-type]
        )
    captions = [Caption(text=chosen.caption, before_line=0)]
    if resolution:
        captions.append(Caption(text=resolution, before_line=last + 1))
        panels[-1] = PanelMoment(framing="wide", ref_kind="caption", ref_index=1, focus=[roles["hero"]])
    return SceneScript(
        beat_index=beat.index,
        setting=beat.setting,
        music=chosen.music,  # type: ignore[arg-type]
        lines=lines,
        captions=captions,
        stage_directions=directions,
        onomatopoeia=[Onomatopoeia(text=t, line=min(i, last)) for t, i in chosen.sound],
        cues=[Cue(sfx=s, line=min(i, last)) for s, i in chosen.sfx],  # type: ignore[arg-type]
        panels=panels,
        is_fallback=True,
        prompt_version=FALLBACK_VERSION,
    )


# --- show-level texts ------------------------------------------------------------------------------------

ACT_TITLE_SETS = [
    ("The Call", "The Game", "The Throne"),
    ("A Crown Unclaimed", "Knives and Goblets", "The Last Ones Standing"),
    ("Peasants Rise", "Nobody Is Safe", "One Bottle, One Monarch"),
]
COVER_TITLES = [
    "The Bottle Throne: A Song of Ice and Beer",
    "The Bottle Throne: Knives Out at the Pub",
    "The Bottle Throne: Winter Is Thirsty",
    "The Bottle Throne: A Clash of Corks",
]


def fallback_bible(fate: FateScript, seed: str) -> ShowBible:
    story = storyline(fate)
    prophecy = next(b for b in fate.beats if b.card == "prophecy")
    title = Stream(seed, "fallback:title").choice(COVER_TITLES)
    return ShowBible(
        title=title,
        prophecy=" / ".join(h.text for h in prophecy.prophecy_hints) or "One shall rise, and one shall reign.",
        motifs=["the bottle", "a suspicious goat", "paper crowns"],
        beats=[BeatSynopsis(index=b.index, synopsis=s.statement) for b, s in zip(fate.beats, story.beats, strict=True)],
        threads=default_threads(story),
        motivations=[default_motivation(fate, c.id) for c in fate.characters if c.kind == "participant"],
        exit_reasons=[default_exit_reason(fate, story, cid, i) for cid, i in participant_exits(fate)],
    )


def fallback_chronicle(fate: FateScript, seed: str) -> ChronicleTexts:
    stream = Stream(seed, "fallback:chronicle")
    acts = stream.choice(ACT_TITLE_SETS)
    names = {c.id: c for c in fate.characters}
    winner = names[fate.winner]
    archetype = ARCHETYPE_LABELS.get(winner.archetype or "", "peasant")
    fallen = [e for b in fate.beats for e in b.eliminations if names[e.character].kind == "participant"]
    epilogue = (
        f"When the dust settled, {winner.name} the {archetype} sat upon the Bottle Throne. "
        f"{len(fallen)} rivals fell, fled or were sent away along the way. "
        f"The old crown passed on, the prophecy came true, and the bottle was finally opened. "
        f"Long may {winner.name} reign, at least until next Friday."
    )
    return ChronicleTexts(
        act_titles=ActTitles(act_1=acts[0], act_2=acts[1], act_3=acts[2]),
        epilogue=epilogue,
        cover_title=stream.choice(COVER_TITLES),
        blurb=(
            f"{fate.roster_size} peasants. One bottle. Alliances, betrayals and a very suspicious goat. "
            "Who will be crowned when the curtain falls?"
        ),
    )
