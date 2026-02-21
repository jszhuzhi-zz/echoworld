const { createServer } = require('./dist/api/server');
const { World } = require('./dist/core/World');
const world = new World({ maxEntities: 100 });
const app = createServer(world, 4999);

setTimeout(async () => {
  const base = 'http://127.0.0.1:4999';

  async function req(method, path, body, token) {
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    const opt = { method, headers };
    if (body) opt.body = JSON.stringify(body);
    const res = await fetch(base + path, opt);
    const data = await res.json();
    return { status: res.status, data };
  }

  try {
    // Login with test account
    const login = await req('POST', '/api/auth/login', { username: 'testplayer', password: 'test123456' });
    console.log('1. Login:', login.status, login.data.error || 'OK entityId=' + login.data.user?.entityId);
    const token = login.data.token;
    if (!token) { console.log('ABORT: no token'); process.exit(1); }

    // /api/world/me
    const me = await req('GET', '/api/world/me', null, token);
    console.log('2. Me:', me.status, me.data.error || ('nodeId=' + me.data.state?.nodeId + ' node=(' + me.data.node?.x + ',' + me.data.node?.y + ') type=' + me.data.node?.type));
    console.log('   nearbyLots:', me.data.nearbyLots?.length);
    console.log('   entity:', me.data.entity ? 'currency=' + me.data.entity.currency : 'NULL!!');
    console.log('   state alive:', me.data.state?.alive, 'actions:', me.data.state?.actionsToday + '/' + me.data.state?.maxActions);

    // Roll dice
    const roll = await req('POST', '/api/world/roll', {}, token);
    console.log('3. Roll:', roll.status, roll.data.error || ('roll=' + roll.data.roll + ' dirs=' + roll.data.directions?.length));
    if (roll.data.directions) {
      for (const d of roll.data.directions) {
        console.log('   dir:', d.label, '-> nodeId=' + d.nodeId, '(' + d.x + ',' + d.y + ')');
      }
    }

    if (roll.status === 200 && roll.data.directions?.length > 0) {
      const dir = roll.data.directions[0];
      const move = await req('POST', '/api/world/move', { directionNodeId: dir.nodeId }, token);
      console.log('4. Move:', move.status, move.data.error || ('fork=' + move.data.fork + ' path=' + move.data.path?.length + 'pts'));
      if (move.data.error) console.log('   MOVE ERROR:', move.data.error);
      if (move.data.messages) console.log('   msgs:', move.data.messages);
      if (move.data.finalNode) console.log('   finalNode: (' + move.data.finalNode.x + ',' + move.data.finalNode.y + ') type=' + move.data.finalNode.type);
    }

    // Check nearbyLots again
    const me2 = await req('GET', '/api/world/me', null, token);
    console.log('5. nearbyLots=' + me2.data.nearbyLots?.length + ' at (' + me2.data.node?.x + ',' + me2.data.node?.y + ')');

    // Build
    if (me2.data.nearbyLots?.length > 0) {
      const lot = me2.data.nearbyLots[0];
      console.log('   building on lot id=' + lot.id + ' at (' + lot.x + ',' + lot.y + ')');
      const build = await req('POST', '/api/world/build', { nodeId: lot.id, templateType: 'food_stand' }, token);
      console.log('6. Build:', build.status, build.data.error || build.data.message);
    } else {
      console.log('6. No lots nearby');
    }

    // Test economy endpoint
    const econ = await req('GET', '/api/world/economy');
    console.log('7. Economy:', econ.status, 'total=' + econ.data.totalWorldWealth, 'treasury=' + econ.data.treasuryBalance, 'players=' + econ.data.playerCount);

    // Test recharge (first time = bonus)
    const recharge = await req('POST', '/api/world/recharge', { amount: 100 }, token);
    console.log('8. Recharge:', recharge.status, recharge.data.error || ('amount=' + recharge.data.amount + ' bonus=' + recharge.data.bonus + ' total=' + recharge.data.totalCC + ' firstRecharge=' + recharge.data.isFirstRecharge));

    // Test recharge again (no bonus)
    const recharge2 = await req('POST', '/api/world/recharge', { amount: 50 }, token);
    console.log('9. Recharge2:', recharge2.status, 'bonus=' + recharge2.data.bonus + ' firstRecharge=' + recharge2.data.isFirstRecharge);

    // Test register with referral code
    const loginData = login.data.user;
    console.log('   My referral code:', loginData?.referralCode);

  } catch(e) {
    console.error('ERROR:', e.message);
  }
  process.exit(0);
}, 2000);
