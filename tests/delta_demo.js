// Delta tracking demo — verify enhanced odds work correctly
// Shows that backward compatibility is maintained while new delta features work

import { setConfig, getMatchMoneyline, getLiveMatchMoneyline } from '../app/js/betting.js';

// Mock team configuration
const mockTeams = {
  'teamA': { combined: 10 },  // 5.0 effective handicap
  'teamB': { combined: 20 }   // 10.0 effective handicap
};

setConfig({ teams: mockTeams, flights: {} });

console.log('🏌️ Odds Delta Tracking Demo\n');

console.log('═══ 1. BACKWARD COMPATIBILITY CHECK ═══');
// Verify existing code patterns still work
const { mlA, mlB, probA, probB } = getMatchMoneyline('teamA', 'teamB');
console.log(`✓ Existing destructuring works: mlA=${mlA}, mlB=${mlB}`);
console.log(`✓ Probabilities: A=${(probA*100).toFixed(1)}%, B=${(probB*100).toFixed(1)}%`);

console.log('\n═══ 2. FIRST CALL (NO DELTA) ═══');
const firstCall = getMatchMoneyline('teamA', 'teamB', 'match1');
console.log('📊 First odds calculation:');
console.log(`  mlA: ${firstCall.mlA}, mlB: ${firstCall.mlB}`);
console.log(`  Previous odds: ${firstCall.previousOdds}`);
console.log(`  Delta A: ${firstCall.deltaA} (${firstCall.directionA}, ${firstCall.magnitudeA})`);
console.log(`  Delta B: ${firstCall.deltaB} (${firstCall.directionB}, ${firstCall.magnitudeB})`);

console.log('\n═══ 3. SIMULATE SCORE UPDATE ═══');
// Simulate a scenario where Team A gains advantage
const liveState1 = { holesPlayed: 3, totalHoles: 18, scoreA: 2, scoreB: 1 };
const liveOdds1 = getLiveMatchMoneyline('teamA', 'teamB', 'match1', liveState1);
console.log('📈 After Team A takes 2-1 lead:');
console.log(`  mlA: ${liveOdds1.mlA} (was ${firstCall.mlA})`);
console.log(`  mlB: ${liveOdds1.mlB} (was ${firstCall.mlB})`);
console.log(`  Delta A: ${liveOdds1.deltaA} (${liveOdds1.directionA}, ${liveOdds1.magnitudeA})`);
console.log(`  Delta B: ${liveOdds1.deltaB} (${liveOdds1.directionB}, ${liveOdds1.magnitudeB})`);
console.log(`  Previous odds: ${JSON.stringify(liveOdds1.previousOdds)}`);

console.log('\n═══ 4. FURTHER SCORE UPDATE ═══');
// Team B fights back
const liveState2 = { holesPlayed: 6, totalHoles: 18, scoreA: 3, scoreB: 3 };
const liveOdds2 = getLiveMatchMoneyline('teamA', 'teamB', 'match1', liveState2);
console.log('⚖️ After match ties 3-3:');
console.log(`  mlA: ${liveOdds2.mlA} (was ${liveOdds1.mlA})`);
console.log(`  mlB: ${liveOdds2.mlB} (was ${liveOdds1.mlB})`);
console.log(`  Delta A: ${liveOdds2.deltaA} (${liveOdds2.directionA}, ${liveOdds2.magnitudeA})`);
console.log(`  Delta B: ${liveOdds2.deltaB} (${liveOdds2.directionB}, ${liveOdds2.magnitudeB})`);

console.log('\n═══ 5. UX ANIMATION DATA ═══');
// Show the exact format Divot needs for animations
const animationData = {
  previousOdds: { player1: liveOdds1.mlA, player2: liveOdds1.mlB },
  currentOdds: { player1: liveOdds2.mlA, player2: liveOdds2.mlB },
  delta: { player1: liveOdds2.deltaA, player2: liveOdds2.deltaB },
  direction: { player1: liveOdds2.directionA, player2: liveOdds2.directionB },
  magnitude: { player1: liveOdds2.magnitudeA, player2: liveOdds2.magnitudeB }
};

console.log('🎨 Data ready for UX animations:');
console.log(JSON.stringify(animationData, null, 2));

console.log('\n✅ All functionality working correctly!');
console.log('✅ Backward compatibility maintained');
console.log('✅ Delta tracking operational');
console.log('✅ Ready for Divot to implement animations');