#!/bin/bash
API="https://betwaggle.com/app/api"
PIN="2026"

PLAYERS=(
  "Billy Green" "Joe Pryor" "Zachary Phlegar" "Chase Cury"
  "Ryan Wolter" "Shane Wolter" "Ariel Saban" "Mark Wagenberg"
  "Jason Goldberg" "Matt Scarafoni" "Scott Weiselberg" "Jon Weber"
  "Jonathan Shapero" "Jonny Slater" "Shlomi Asayag" "Anthony Pollak"
  "Bradley Moskovitz" "Max Winter" "Brett Weiselberg" "Andrew Hausdorff"
  "Michael Rau" "Joseph Dabrowski" "Bruce Silcoff" "Joseph Young"
  "Robert Sherkin" "Adam Polan" "Noah Storch" "Drew Romano"
  "Michael Messinger" "Logan Izenstark" "Lawrence Weinstein" "Nathan Smith"
  "Michael Papadakis" "Rick Bielen" "Bud Thomas" "Brian Leek"
  "Steven Scheck" "Bradley Sherman" "Jason Morjain" "Bryan Morjain"
  "Michael Conway" "Miles Rubin" "David Arison" "Omer Tiroche"
  "Barry Lewin" "John Martin" "Glenn Kaplan" "Aaron Hattaway"
  "Stephen Miller" "Jeff Weshler" "Adam Froman" "Brian Cohen"
  "Arnold Thorstad" "Matt Pfennig" "Stephen Vecchitto" "Norm Wedderburn"
  "Harry Salinas" "Anthony Sauce" "Glenn Singer" "Kenny Braeseke"
  "David Vecchitto" "Matthew Vecchitto" "Ricardo Malfitano" "Keith Greenberg"
  "Kenneth Zucker" "Mat Sposta" "Lon Goldstein" "Larry Weissman"
  "Jason Ellman" "Vincent Elefante" "Robert Sigler" "David Firestone"
  "Robert Stein" "Mike Malkin" "Neil Rosenfeld" "Richard Chipman"
  "Tyler Gold" "Jeff Leach" "Nick Wall" "Alex Ardente"
  "Paul Riemer" "Josh Diamond" "Murry Shapero" "Greg Slater"
  "Gary Pyott" "Ryan Tucker" "Drew Seder" "Rob Grinberg"
  "Brent Porges" "Frank Smookler" "Jordan Sayfie" "Morten Aagaard"
  "Evan Ratner" "Craig Posner" "Rajiv Sharma" "Ashwani Mayur"
)

for name in "${PLAYERS[@]}"; do
  echo "Creating: $name"
  curl -s -X POST "$API/player" \
    -H "Content-Type: application/json" \
    -H "X-Admin-Pin: $PIN" \
    -d "{\"name\": \"$name\", \"credits\": 50}" | head -c 200
  echo ""
  sleep 0.1
done

echo "Done! Created ${#PLAYERS[@]} players with \$50 credits each."
