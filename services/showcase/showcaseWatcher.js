// services/showcase/showcaseWatcher.js
//
// Watches #showcase for either 10 unique reactors (any emoji) or a single
// staff ⭐, and fires a site dispatch the moment a post qualifies.
//
// Requires the client to be built with these intents/partials (add
// whatever's missing to your existing client setup):
//   intents: [..., GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.GuildMembers]
//   partials: [..., Partials.Message, Partials.Reaction, Partials.User]

const fs = require("fs");
const path = require("path");
const { dispatchShowcaseToSite } = require("../../utils/siteShowcaseDispatcher");
const logger = require("../../logger"); // adjust path to match your existing logger

const SHOWCASE_CHANNEL_ID = process.env.SHOWCASE_CHANNEL_ID;

// Comma-separated list of role IDs that count as "staff" for instant ⭐
// picks — e.g. SHOWCASE_STAFF_ROLE_ID=111111111111111111,222222222222222222
const STAFF_ROLE_IDS = (process.env.SHOWCASE_STAFF_ROLE_ID || "")
  .split(",")
  .map((id) => id.trim())
  .filter(Boolean);

const REACTION_THRESHOLD = parseInt(process.env.SHOWCASE_REACTION_THRESHOLD || "10", 10);
const STAFF_EMOJI = process.env.SHOWCASE_STAFF_EMOJI || "⭐";

// Tracks which message IDs have already been featured, so re-triggering
// (e.g. an 11th reactor after it's already gone out) is a no-op here too —
// belt-and-suspenders alongside the site script's own idempotency check.
const SUBMISSIONS_PATH = path.join(__dirname, "..", "..", "data", "showcaseSubmissions.json");

function loadSubmitted() {
  try {
    return new Set(JSON.parse(fs.readFileSync(SUBMISSIONS_PATH, "utf8")));
  } catch {
    return new Set();
  }
}

function markSubmitted(messageId, submitted) {
  submitted.add(messageId);
  fs.writeFileSync(SUBMISSIONS_PATH, JSON.stringify([...submitted], null, 2), "utf8");
}

function firstImageUrl(message) {
  const attachment = message.attachments.find((a) => a.contentType?.startsWith("image/"));
  if (attachment) return attachment.url;
  const embed = message.embeds.find((e) => e.image?.url);
  return embed ? embed.image.url : null;
}

async function countUniqueReactors(message) {
  const uniqueUserIds = new Set();
  for (const reaction of message.reactions.cache.values()) {
    const users = await reaction.users.fetch();
    for (const user of users.values()) {
      if (!user.bot) uniqueUserIds.add(user.id);
    }
  }
  return uniqueUserIds.size;
}

async function tryFeature(message, submitted) {
  if (submitted.has(message.id)) return;

  const imageUrl = firstImageUrl(message);
  if (!imageUrl) return; // nothing to show on the site without an image

  const payload = {
    submission_id: message.id,
    image_url: imageUrl,
    username: message.author?.tag || message.author?.username || "Unknown",
    channel: `#${message.channel.name}`,
    posted_at: message.createdAt.toISOString(),
    title: message.content?.trim() || undefined,
    message_url: message.url
  };

  await dispatchShowcaseToSite(payload);
  markSubmitted(message.id, submitted);
  logger.info(`[showcase] Featured message ${message.id} from ${payload.username}`);
}

function initShowcaseWatcher(client) {
  if (!SHOWCASE_CHANNEL_ID) {
    logger.warn("[showcase] SHOWCASE_CHANNEL_ID not set — showcase watcher disabled");
    return;
  }

  const submitted = loadSubmitted();

  client.on("messageReactionAdd", async (reaction, user) => {
    try {
      if (reaction.message.channelId !== SHOWCASE_CHANNEL_ID) return;
      if (user.bot) return;

      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();

      const message = reaction.message;
      if (submitted.has(message.id)) return;

      // Instant staff pick: the star, from someone with one of the staff roles.
      if (reaction.emoji.name === STAFF_EMOJI && STAFF_ROLE_IDS.length) {
        const member = await message.guild.members.fetch(user.id).catch(() => null);
        const isStaff = member && STAFF_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId));
        if (isStaff) {
          await tryFeature(message, submitted);
          return;
        }
      }

      // Otherwise: has this post now picked up enough different reactors,
      // across any/all emoji combined?
      const uniqueCount = await countUniqueReactors(message);
      if (uniqueCount >= REACTION_THRESHOLD) {
        await tryFeature(message, submitted);
      }
    } catch (err) {
      logger.warn("[showcase] Error handling reaction:", err);
    }
  });

  logger.info(`[showcase] Watching #${SHOWCASE_CHANNEL_ID} (threshold=${REACTION_THRESHOLD}, staff emoji=${STAFF_EMOJI}, staff roles=${STAFF_ROLE_IDS.join(",") || "none"})`);
}

module.exports = { initShowcaseWatcher };
