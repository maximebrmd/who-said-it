import type { Chat, Message } from "./types";

/**
 * SYNTHETIC sample data — entirely made-up names and messages. This lets the
 * repo run and be tested without any secrets or real chat content. When a real
 * Supabase project is configured, the app uses that instead (see lib/game/data).
 */

export interface SampleChat extends Chat {
  participants: string[];
  messages: Message[];
}

function mk(slug: string, lines: [author: string, body: string][]): Message[] {
  return lines.map(([author, body], i) => ({
    id: `${slug}-${i}`,
    body,
    author,
  }));
}

export const SAMPLE_CHATS: SampleChat[] = [
  {
    slug: "sample-roommates",
    name: "Sample · Roommates",
    participants: ["Mara", "Tomas", "Priya", "Diego"],
    messages: mk("sample-roommates", [
      ["Mara", "Whoever finished the oat milk and put the empty carton back, I will find you"],
      ["Tomas", "It was the ghost, I have an airtight alibi at the gym all morning"],
      ["Priya", "Can we please agree on a dish rota before this becomes a war crime"],
      ["Diego", "I vote we just buy paper plates and live like kings forever"],
      ["Mara", "Diego that is the worst idea you have had since the indoor slip n slide"],
      ["Tomas", "The slip n slide was a triumph and history will vindicate me"],
      ["Priya", "Reminder that rent is due tomorrow, please send me your share tonight"],
      ["Diego", "Sending now, also the wifi router is blinking red again send help"],
      ["Mara", "Turn it off and on again, it is basically our landlord at this point"],
      ["Tomas", "Movie night friday? I will make the popcorn if someone picks the film"],
      ["Priya", "Only if we are not watching another three hour space documentary"],
      ["Diego", "Space documentaries are peak cinema and I will not be taking questions"],
      ["Mara", "Someone left the bathroom fan on for two days, the electric bill is crying"],
      ["Tomas", "Not me, I shower in total darkness like a respectable raccoon"],
      ["Priya", "I found a couch on the curb that is honestly nicer than ours"],
      ["Diego", "Absolutely not, the last curb couch gave us the great flea incident"],
    ]),
  },
  {
    slug: "sample-trip-crew",
    name: "Sample · Trip Crew",
    participants: ["Nadia", "Felix", "Joon", "Liv", "Sam"],
    messages: mk("sample-trip-crew", [
      ["Nadia", "Okay flights are booked, we land at noon and chaos begins immediately"],
      ["Felix", "Did anyone actually book the hostel or are we manifesting a roof"],
      ["Joon", "I booked it, we have two rooms and a kitchen, you are all welcome"],
      ["Liv", "Joon you are the only functional adult in this entire group chat"],
      ["Sam", "I will handle the playlist, prepare for forty minutes of sea shanties"],
      ["Nadia", "If you play one more sea shanty I am swimming back to the mainland"],
      ["Felix", "Vote for renting bikes on day two, the coast road looks unreal"],
      ["Joon", "Bikes yes but I am not climbing that hill twice like last summer"],
      ["Liv", "Can we schedule at least one day of doing absolutely nothing"],
      ["Sam", "Doing nothing is my entire personality, finally my time to shine"],
      ["Nadia", "Bring cash, half the food stalls there do not take cards at all"],
      ["Felix", "Reminder to actually pack sunscreen this time, my back remembers"],
      ["Joon", "I made a shared doc for the budget so we stop arguing over coffee money"],
      ["Liv", "The budget doc already has a tab called snacks, I love this team"],
      ["Sam", "Weather says rain on thursday so that is officially museum day"],
      ["Nadia", "Museum day means I get to read every single plaque out loud sorry"],
    ]),
  },
];
