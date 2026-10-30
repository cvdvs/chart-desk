// ============================================================
// The tarot deck — all 78 cards for the reader (pages/tarot.astro).
// Pure ESM, no DOM, no dependencies; imported server-side and
// client-side like lib/matrix.js.
//
// Majors carry RWS numbering (0 The Fool … 21 The World; 8 is
// Strength, 11 is Justice). Names and essences are the site's
// approved arcana wording, imported from lib/matrix.js — the
// Matrix keys the same 22 cards with The Fool at 22, so RWS 0
// maps to ARCANA[22] and 1–21 map straight across.
//
// Minors are written here in the same register: name, suit, rank
// (1–10 pips, 11 Page, 12 Knight, 13 Queen, 14 King), a few
// keywords, and a one-line essence.
//
// Plates: public/assets/plates/tarot/{slug}.webp — the treated
// 1909 Rider–Waite–Smith scans, emitted at PLATE_W × PLATE_H by
// scripts/build-tarot-plates.mjs. Every card has a codex entry,
// so codexHref always points at /codex/{slug}/.
// ============================================================
import { ARCANA } from './matrix.js';

export const PLATE_DIR = '/assets/plates/tarot';
export const PLATE_W = 420;
export const PLATE_H = 720;

const slugify = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Every card now has its own codex entry at /codex/{slug}/ (78 of 78), so the
// reader links straight through. A major's Matrix arcanum lives in that entry's
// rhymes rather than being the link target.

const major = (number) => {
  const { name, essence } = ARCANA[number === 0 ? 22 : number];
  const slug = slugify(name);
  return {
    slug,
    name,
    arcana: 'major',
    number,
    suit: null,
    rank: null,
    keywords: null,
    essence,
    plate: `${PLATE_DIR}/${slug}.webp`,
    codexHref: `/codex/${slug}/`,
  };
};

const RANK_NAMES = [null, 'Ace', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Page', 'Knight', 'Queen', 'King'];
const SUIT_NAMES = { wands: 'Wands', cups: 'Cups', swords: 'Swords', pentacles: 'Pentacles' };

// per suit, ranks 1–14 in order: [keywords, essence]
const MINORS = {
  wands: [
    [['spark', 'beginning', 'vocation'], 'the offered branch; a work that wants to begin.'],
    [['horizon', 'planning', 'restlessness'], 'the globe held on the battlement; a horizon being weighed.'],
    [['foresight', 'expansion', 'waiting'], 'ships sent out; the long watch over what was set moving.'],
    [['threshold', 'celebration', 'homecoming'], 'the garlanded gate; a pause to honor what stands.'],
    [['friction', 'contest', 'scatter'], 'five staves crossing; friction that sharpens or scatters.'],
    [['victory', 'recognition', 'return'], 'the laurel rider; a victory that must be carried well.'],
    [['defense', 'conviction', 'persistence'], 'the high ground held; one staff in hand, six standing up from below.'],
    [['speed', 'news', 'momentum'], 'eight staves in flight; everything arriving at once.'],
    [['resilience', 'vigilance', 'weariness'], 'the last watch; wounded, standing, not finished.'],
    [['burden', 'overreach', 'completion'], 'all ten gathered into one armful and carried alone.'],
    [['enthusiasm', 'message', 'exploration'], 'the messenger of fire; news that wants an adventure.'],
    [['haste', 'passion', 'departure'], 'the leaping horse; desire that outruns its plan.'],
    [['warmth', 'confidence', 'magnetism'], 'the sunflower held plainly; warmth that fills a room.'],
    [['vision', 'leadership', 'resolve'], 'the salamander throne; a fire that has learned to govern.'],
  ],
  cups: [
    [['feeling', 'openness', 'overflow'], 'the overflowing cup; feeling offered before reason.'],
    [['partnership', 'exchange', 'mutuality'], 'two cups leveled; a meeting that makes both more.'],
    [['friendship', 'celebration', 'harvest'], 'the lifted cups; a joy that needs company.'],
    [['apathy', 'withdrawal', 'reappraisal'], 'a fourth cup offered; the eyes stay down.'],
    [['loss', 'grief', 'remainder'], 'three spilled, two standing; grief slow to turn around.'],
    [['memory', 'innocence', 'nostalgia'], 'flowers from the old garden; the past offering its sweetness.'],
    [['fantasy', 'choice', 'illusion'], 'seven cups of smoke; wanting all, choosing none.'],
    [['departure', 'search', 'renunciation'], 'the stacked cups left standing; the walk out toward the missing thing.'],
    [['contentment', 'plenty', 'wish'], 'the arc of cups behind him; the wish granted, for now.'],
    [['fulfillment', 'family', 'arrival'], 'the rainbow over the house; feeling brought all the way home.'],
    [['imagination', 'surprise', 'tenderness'], 'the fish in the cup; feeling that arrives as surprise.'],
    [['romance', 'invitation', 'idealism'], 'the slow rider, cup extended; the heart’s formal invitation.'],
    [['empathy', 'intuition', 'depth'], 'the closed cup studied; feeling read from the inside.'],
    [['composure', 'counsel', 'mastery'], 'still on a restless sea; feeling governed, not denied.'],
  ],
  swords: [
    [['clarity', 'truth', 'decision'], 'the crowned blade; a truth that cuts the matter open.'],
    [['stalemate', 'avoidance', 'truce'], 'blindfolded, a sword in each hand, the blades raised and crossed; the choice held at bay.'],
    [['heartbreak', 'honesty', 'grief'], 'three blades, one heart; the plain fact that hurts.'],
    [['rest', 'retreat', 'recovery'], 'the effigy laid still, hands in prayer; a truce with one\'s own mind.'],
    [['defeat', 'discord', 'cost'], 'the gathered swords; a victory that emptied the field.'],
    [['passage', 'transition', 'quiet'], 'the low ferry; carrying what is left toward the calmer bank.'],
    [['stealth', 'strategy', 'evasion'], 'five blades carried off; cleverness on soft feet.'],
    [['restriction', 'fear', 'self-binding'], 'bound and blindfolded; the knot looser than it feels.'],
    [['anguish', 'sleeplessness', 'dread'], 'the night sat upright; sorrows the dark enlarges.'],
    [['ending', 'ruin', 'release'], 'the worst already done; light already at the horizon.'],
    [['curiosity', 'vigilance', 'questions'], 'the blade held into the wind; a quick mind on watch.'],
    [['charge', 'conviction', 'haste'], 'the full gallop; an idea ridden headlong.'],
    [['candor', 'discernment', 'solitude'], 'the raised blade, the open hand; clarity that has grieved.'],
    [['judgment', 'authority', 'principle'], 'the seated verdict; a mind that rules its weather.'],
  ],
  pentacles: [
    [['opportunity', 'seed', 'ground'], 'the coin from the cloud; a seed set in real ground.'],
    [['balance', 'flux', 'juggling'], 'two coins in a turning loop; balance kept by moving.'],
    [['craft', 'collaboration', 'commission'], 'the mason at the arch; craft meeting its commission.'],
    [['holding', 'control', 'scarcity'], 'the coin clutched close; keeping mistaken for having.'],
    [['hardship', 'exclusion', 'endurance'], 'snow past a lit window; the light nobody looks up at.'],
    [['generosity', 'exchange', 'imbalance'], 'coins from one hand, the balance held in the other.'],
    [['patience', 'assessment', 'yield'], 'hands folded on the handle; the long look at what grows.'],
    [['diligence', 'apprenticeship', 'repetition'], 'coin after coin at the bench; mastery by repetition.'],
    [['self-sufficiency', 'refinement', 'enjoyment'], 'the hooded falcon in the vineyard; plenty enjoyed alone.'],
    [['legacy', 'continuity', 'household'], 'the arch of three generations; wealth become a household.'],
    [['study', 'intention', 'groundwork'], 'the coin held to the light; study that means to build.'],
    [['method', 'steadiness', 'patience'], 'the standing horse; slow work that arrives.'],
    [['nurture', 'practicality', 'care'], 'the coin in a tended lap; care made material.'],
    [['stewardship', 'abundance', 'mastery'], 'the vine-grown throne; wealth that keeps its garden.'],
  ],
};

const minor = (suit, rank, keywords, essence) => {
  const name = `${RANK_NAMES[rank]} of ${SUIT_NAMES[suit]}`;
  const slug = slugify(name);
  return {
    slug,
    name,
    arcana: 'minor',
    number: null,
    suit,
    rank,
    keywords,
    essence,
    plate: `${PLATE_DIR}/${slug}.webp`,
    codexHref: `/codex/${slug}/`,
  };
};

export const DECK = [
  ...Array.from({ length: 22 }, (_, n) => major(n)),
  ...Object.entries(MINORS).flatMap(([suit, rows]) =>
    rows.map(([keywords, essence], i) => minor(suit, i + 1, keywords, essence))),
];

/** Invariants the deck must hold; asserted by hand with node when the data changes. */
export const TEST_FIXTURES = {
  deckSize: 78,
  majors: 22,
  minorsPerSuit: { wands: 14, cups: 14, swords: 14, pentacles: 14 },
  rwsNumbering: { 'the-fool': 0, strength: 8, justice: 11, 'the-sun': 19, 'the-world': 21 },
  foolArcanaKey: 22, // The Fool sits at 22 in lib/matrix.js ARCANA, 0 here
  codexLinked: { strength: '/codex/strength/', 'the-sun': '/codex/the-sun/' }, // every card links; each to its own entry
  sampleSlugs: ['the-high-priestess', 'the-wheel', 'ace-of-wands', 'page-of-cups', 'ten-of-pentacles'],
  platePath: '/assets/plates/tarot/the-fool.webp',
};
