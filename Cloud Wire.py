import aiohttp
import discord
from discord import app_commands
from discord.ext import commands

TOKEN = "YOUR_DISCORD_BOT_TOKEN"
BOT_SECRET = "cloudwire-bot-change-me"
API_URL = "https://cloudwire.cfd/api"
ALLOWED_USER_ID = 841749813702688858

intents = discord.Intents.default()
bot = commands.Bot(command_prefix="!", intents=intents)


@bot.event
async def on_ready():
    await bot.tree.sync()
    print(f"Cloud Wire.py online as {bot.user}")


@bot.tree.command(name="whitelist", description="Upgrade a CloudWire website user")
@app_commands.describe(user="Discord user to notify", premium_plan="Website premium plan", username="Website username")
@app_commands.choices(premium_plan=[
    app_commands.Choice(name="Standard", value="Standard"),
    app_commands.Choice(name="Standard Annual", value="Standard Annual"),
    app_commands.Choice(name="Indie Hacker", value="Indie Hacker"),
    app_commands.Choice(name="Professional", value="Professional"),
])
async def whitelist(
    interaction: discord.Interaction,
    user: discord.User,
    premium_plan: app_commands.Choice[str],
    username: str,
):
    if interaction.user.id != ALLOWED_USER_ID:
        await interaction.response.send_message("you do not have permission", ephemeral=True)
        return
    await interaction.response.defer(ephemeral=True)
    plan = premium_plan.value
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{API_URL}/admin/whitelist",
                json={"username": username.strip(), "plan": plan},
                headers={"X-Bot-Secret": BOT_SECRET, "Content-Type": "application/json"},
                timeout=aiohttp.ClientTimeout(total=20),
            ) as resp:
                data = await resp.json(content_type=None)
                if resp.status != 200:
                    await interaction.followup.send(str(data.get("error") or "Whitelist failed"), ephemeral=True)
                    return
    except Exception:
        await interaction.followup.send("Could not reach CloudWire API.", ephemeral=True)
        return
    try:
        await user.send(
            f"you have been upgraded to the plan of {plan}.\n"
            "refresh the page, of the website (if you haven't already), and check your premium status."
        )
    except discord.Forbidden:
        await interaction.followup.send(
            f"Upgraded `{username}` to {plan}, but I could not DM {user.mention}.",
            ephemeral=True,
        )
        return
    await interaction.followup.send(f"Whitelisted `{username}` as {plan}. DM sent.", ephemeral=True)


if __name__ == "__main__":
    bot.run(TOKEN)
