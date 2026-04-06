# Tournament Bracket Simulation

Simulates a 64-player single-elimination tournament bracket to estimate the probability
that two specific players (Alex and Miguel) face each other at some point in the tournament.

Inspired by [this YouTube video](https://youtube.com/shorts/1WXWnqkEiw8?si=c4DKBkQ0mRuPS2U7).

## How it works

- 64 players are placed randomly in a single-elimination bracket.
- In each round, a random winner is chosen for each match.
- Winners advance up the bracket until a champion is crowned.
- Alex and Miguel are represented by stick figures (no names displayed).
- The simulation tracks whether Alex and Miguel ever face each other.
- Statistics are continuously updated: total simulations and the percentage
  in which Alex and Miguel met.
- Toggle the animation off to run simulations much faster.
