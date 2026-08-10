import { describe, expect, it, vi } from 'vitest';
import { findBroadcastBody, HomeAssistantClient } from './homeAssistant';
import {
  climateStateKey,
  coolingStateKey,
  eveningStateKey,
  guestModeStateKey,
  guestVoucherStateKey,
  homeStateKey,
  homeModeStateKey,
  morningStateKey,
  nightStateKey,
  outdoorStateKey,
} from '../shared/entities';

const stateResponse = (entityId: string, state = 'on', attributes: Record<string, unknown> = {}) => new Response(
  JSON.stringify({ entity_id: entityId, state, attributes }),
  { status: 200 },
);

describe('HomeAssistantClient', () => {
  it('exports stable dashboard state keys', () => {
    expect([homeStateKey, homeModeStateKey, guestModeStateKey, guestVoucherStateKey, morningStateKey, eveningStateKey, nightStateKey, coolingStateKey, climateStateKey, outdoorStateKey])
      .toEqual(['home', 'homeMode', 'guestMode', 'guestVoucher', 'morning', 'evening', 'night', 'cooling', 'climate', 'outdoor']);
  });

  it('turns on guest mode and returns its fresh state', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(stateResponse('input_boolean.gjest', 'off'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entity_id: 'input_boolean.gjest',
        state: 'on',
        attributes: {},
      }), { status: 200 }));
    const client = new HomeAssistantClient('http://ha:8123', 'test-token', fetcher);

    const result = await client.execute('guestMode');

    expect(fetcher).toHaveBeenNthCalledWith(
      2,
      'http://ha:8123/api/services/input_boolean/turn_on',
      expect.objectContaining({ method: 'POST' }),
    );
    expect(fetcher).toHaveBeenNthCalledWith(
      3,
      'http://ha:8123/api/states/input_boolean.gjest',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(result).toEqual({
      states: {
        guestMode: {
          entity_id: 'input_boolean.gjest',
          state: 'on',
          attributes: {},
        },
      },
    });
  });

  it('turns guest mode off when its confirmed state is on', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(stateResponse('input_boolean.gjest', 'on'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('input_boolean.gjest', 'off'));

    const result = await new HomeAssistantClient('http://ha:8123', 'test-token', fetcher).execute('guestMode');

    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://ha:8123/api/states/input_boolean.gjest', expect.objectContaining({ method: 'GET' }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://ha:8123/api/services/input_boolean/turn_off', expect.objectContaining({ method: 'POST' }));
    expect(result.states).toMatchObject({ guestMode: { state: 'off' } });
  });

  it('creates a guest voucher and returns the latest confirmed code', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(stateResponse('sensor.67647a4bca314858fac0f8fc_voucher', 'OLD-CODE', { create_time: '2026-08-07T20:00:00' }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('sensor.67647a4bca314858fac0f8fc_voucher', 'K7M9-P2Q4', { create_time: '2026-08-08T00:00:00' }));

    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute('guestVoucher');

    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://ha:8123/api/services/button/press', expect.objectContaining({
      body: JSON.stringify({ entity_id: 'button.67647a4bca314858fac0f8fc_create' }),
    }));
    expect(result.states).toMatchObject({ guestVoucher: { state: 'K7M9-P2Q4' } });
  });

  it('selects Borte for home mode', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('input_select.home_state', 'Borte'));
    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute('home', 'Borte');

    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://ha:8123/api/services/input_select/select_option', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ entity_id: 'input_select.home_state', option: 'Borte' }),
    }));
    expect(result.states).toMatchObject({ home: { state: 'Borte' } });
  });

  it.each([
    ['morning', 'automation/trigger', 'automation.modus_god_morgen'],
    ['evening', 'script/turn_on', 'script.1572988362234'],
    ['night', 'script/turn_on', 'script.1569099501074'],
  ] as const)('routes %s through its fixed service and entity', async (action, service, entityId) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse(entityId));

    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute(action);

    expect(fetcher).toHaveBeenNthCalledWith(1, `http://ha:8123/api/services/${service}`, expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ entity_id: entityId }),
    }));
    expect(result.states).toMatchObject({ [action]: { entity_id: entityId } });
  });

  it('turns cooling off when its confirmed automation state is on', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(stateResponse('automation.klima_automatisk_kjoling_optimalisert', 'on'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('automation.klima_automatisk_kjoling_optimalisert', 'off'));

    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute('cooling');

    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://ha:8123/api/states/automation.klima_automatisk_kjoling_optimalisert', expect.objectContaining({ method: 'GET' }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://ha:8123/api/services/automation/turn_off', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ entity_id: 'automation.klima_automatisk_kjoling_optimalisert' }),
    }));
    expect(result.states).toMatchObject({ cooling: { state: 'off' } });
  });

  it('turns cooling on when its confirmed automation state is off', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(stateResponse('automation.klima_automatisk_kjoling_optimalisert', 'off'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('automation.klima_automatisk_kjoling_optimalisert', 'on'));

    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute('cooling');

    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://ha:8123/api/services/automation/turn_on', expect.objectContaining({ method: 'POST' }));
    expect(result.states).toMatchObject({ cooling: { state: 'on' } });
  });

  it.each([
    ['cool', 'automation/turn_on'],
    ['heat', 'automation/turn_off'],
    ['heat_cool', 'automation/turn_off'],
    ['fan_only', 'automation/turn_off'],
  ] as const)('sets heat-pump mode %s and uses %s for the cooling automation', async (mode, automationService) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('automation.klima_automatisk_kjoling_optimalisert', mode === 'cool' ? 'on' : 'off'))
      .mockResolvedValueOnce(stateResponse('climate.stue', mode));

    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute('heatPump', mode);

    expect(fetcher).toHaveBeenNthCalledWith(1, `http://ha:8123/api/services/${automationService}`, expect.objectContaining({
      body: JSON.stringify({ entity_id: 'automation.klima_automatisk_kjoling_optimalisert' }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://ha:8123/api/services/climate/set_hvac_mode', expect.objectContaining({
      body: JSON.stringify({ entity_id: 'climate.stue', hvac_mode: mode }),
    }));
    expect(result.states).toMatchObject({ cooling: { state: mode === 'cool' ? 'on' : 'off' }, climate: { state: mode } });
  });

  it.each(['quiet', 'medium', 'strong'] as const)('sets fan speed %s and returns the confirmed climate state', async (fanMode) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('climate.stue', 'heat', { fan_mode: fanMode }));

    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute('fanSpeed', fanMode);

    expect(fetcher).toHaveBeenNthCalledWith(1, 'http://ha:8123/api/services/climate/set_fan_mode', expect.objectContaining({
      body: JSON.stringify({ entity_id: 'climate.stue', fan_mode: fanMode }),
    }));
    expect(result.states).toMatchObject({ climate: { attributes: { fan_mode: fanMode } } });
  });

  it('sends server-side authorization and JSON headers', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(stateResponse('input_boolean.gjest', 'off'))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('input_boolean.gjest', 'on'));

    await new HomeAssistantClient('http://ha:8123', 'a-real-secret', fetcher).execute('guestMode');

    const getRequest = fetcher.mock.calls[0][1] as RequestInit;
    const postRequest = fetcher.mock.calls[1][1] as RequestInit;
    expect(postRequest.headers).toMatchObject({
      Authorization: 'Bearer a-real-secret',
      'Content-Type': 'application/json',
    });
    expect(getRequest.headers).toMatchObject({
      Authorization: 'Bearer a-real-secret',
      'Content-Type': 'application/json',
    });
  });

  it('gets all dashboard entities including the guest voucher', async () => {
    const entityIds = [
      'input_select.home_state',
      'input_select.home_mode',
      'input_boolean.gjest',
      'sensor.67647a4bca314858fac0f8fc_voucher',
      'automation.modus_god_morgen',
      'script.1572988362234',
      'script.1569099501074',
      'automation.klima_automatisk_kjoling_optimalisert',
      'climate.stue',
      'sensor.indoor_ute_temperature',
      'input_number.toggle_security_mode',
      'lock.aqara_smart_lock_u200_2',
      'sensor.weather_hourly',
      'sensor.weather_daily',
    ];
    const fetcher = vi.fn();
    entityIds.forEach((entityId) => fetcher.mockResolvedValueOnce(stateResponse(entityId)));

    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).getDashboardStates();

    expect(fetcher.mock.calls.map(([url]) => url)).toEqual(entityIds.map((entityId) => `http://ha:8123/api/states/${entityId}`));
    expect(Object.keys(result.states)).toHaveLength(27);
    expect(result.states.doorbellCamera).toMatchObject({ state: 'unavailable' });
  });

  it('finds the AI weather summary in the broadcast service trace node', () => {
    expect(findBroadcastBody({
      trace: {
        'action/9': {
          params: {
            domain: 'rest_command',
            service: 'klara_inbox_broadcast',
            service_data: { title: 'Kveldsvær', body: 'I natt blir det rolig og tørt.' },
          },
        },
      },
    })).toBe('I natt blir det rolig og tørt.');
  });

  it.each([
    ['securityMode', 'script/turn_on', 'script.toggle_security_mode_script', 'securityMode', 'input_number.toggle_security_mode'],
    ['lockDoor', 'lock/lock', 'lock.aqara_smart_lock_u200_2', 'frontDoorLock', 'lock.aqara_smart_lock_u200_2'],
    ['unlockDoor', 'lock/unlock', 'lock.aqara_smart_lock_u200_2', 'frontDoorLock', 'lock.aqara_smart_lock_u200_2'],
  ] as const)('runs fixed %s action and confirms its entity', async (action, service, serviceEntity, key, confirmedEntity) => {
    const fetcher = vi.fn().mockResolvedValueOnce(new Response('{}', { status: 200 })).mockResolvedValueOnce(stateResponse(confirmedEntity));
    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute(action);
    expect(fetcher).toHaveBeenNthCalledWith(1, `http://ha:8123/api/services/${service}`, expect.objectContaining({ body: JSON.stringify({ entity_id: serviceEntity }) }));
    expect(result.states[key]).toMatchObject({ entity_id: confirmedEntity });
  });

  it.each([
    ['an array', []],
    ['a mismatched entity id', { entity_id: 'input_boolean.other', state: 'on', attributes: {} }],
    ['a non-string state', { entity_id: 'input_boolean.toggle', state: 1, attributes: {} }],
    ['non-object attributes', { entity_id: 'input_boolean.toggle', state: 'on', attributes: [] }],
  ])('rejects a state response with %s', async (_description, payload) => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload), { status: 200 }));

    await expect(new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute('guestMode'))
      .rejects.toEqual(new Error('Kunne ikke kommunisere med Home Assistant'));
  });

  it('rejects an invalid action without calling Home Assistant', async () => {
    const fetcher = vi.fn();
    const client = new HomeAssistantClient('http://ha:8123', 'secret', fetcher);

    await expect(client.execute('invalid' as never)).rejects.toThrow('Kunne ikke kommunisere med Home Assistant');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('does not fetch for a non-finite temperature', async () => {
    const fetcher = vi.fn();
    const client = new HomeAssistantClient('http://ha:8123', 'secret', fetcher);

    await expect(client.setTemperature(Number.NaN)).rejects.toThrow('Ugyldig temperatur');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('clamps temperature to Home Assistant limits and returns the confirmed state', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(stateResponse('climate.stue', 'heat', { min_temp: 16, max_temp: 24 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('climate.stue', 'heat', { temperature: 24 }));
    const client = new HomeAssistantClient('http://ha:8123', 'secret', fetcher);

    const result = await client.setTemperature(30);

    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://ha:8123/api/services/climate/set_temperature', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ entity_id: 'climate.stue', temperature: 24 }),
    }));
    expect(fetcher).toHaveBeenNthCalledWith(3, 'http://ha:8123/api/states/climate.stue', expect.anything());
    expect(result).toEqual({ states: { climate: {
      entity_id: 'climate.stue', state: 'heat', attributes: { temperature: 24 },
    } } });
  });

  it('switches a fan-only climate to cool before setting its temperature', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(stateResponse('climate.stue', 'fan_only', { min_temp: 18, max_temp: 32, current_temperature: 25, hvac_modes: ['fan_only', 'cool'] }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('climate.stue', 'cool', { min_temp: 18, max_temp: 32, temperature: 25, current_temperature: 25 }))
      .mockResolvedValueOnce(new Response('{}', { status: 200 }))
      .mockResolvedValueOnce(stateResponse('climate.stue', 'cool', { min_temp: 18, max_temp: 32, temperature: 24, current_temperature: 25 }));

    const result = await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).setTemperature(24);

    expect(fetcher).toHaveBeenNthCalledWith(2, 'http://ha:8123/api/services/climate/set_hvac_mode', expect.objectContaining({ body: JSON.stringify({ entity_id: 'climate.stue', hvac_mode: 'cool' }) }));
    expect(fetcher).toHaveBeenNthCalledWith(4, 'http://ha:8123/api/services/climate/set_temperature', expect.objectContaining({ body: JSON.stringify({ entity_id: 'climate.stue', temperature: 24 }) }));
    expect(result.states).toMatchObject({ climate: { state: 'cool', attributes: { temperature: 24 } } });
  });

  it.each([
    ['a nonnumeric minimum', { min_temp: '16', max_temp: 24 }],
    ['a non-finite maximum', { min_temp: 16, max_temp: Number.POSITIVE_INFINITY }],
    ['inverted limits', { min_temp: 24, max_temp: 16 }],
  ])('rejects climate state with %s before posting a temperature', async (_description, attributes) => {
    const fetcher = vi.fn().mockResolvedValue(stateResponse('climate.stue', 'heat', attributes));
    const client = new HomeAssistantClient('http://ha:8123', 'secret', fetcher);

    await expect(client.setTemperature(20)).rejects.toEqual(new Error('Kunne ikke kommunisere med Home Assistant'));
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0][0]).toBe('http://ha:8123/api/states/climate.stue');
  });

  it('does not expose upstream failure details', async () => {
    const upstreamToken = 'fake-upstream-token-8675309';
    const sensitiveText = 'sensitive diagnostic detail';
    const fetcher = vi.fn().mockResolvedValue(new Response(
      `token=${upstreamToken}; ${sensitiveText}`,
      { status: 500 },
    ));

    try {
      await new HomeAssistantClient('http://ha:8123', 'secret', fetcher).execute('guestMode');
      throw new Error('Expected Home Assistant command to fail');
    } catch (error) {
      expect(error).toEqual(new Error('Kunne ikke kommunisere med Home Assistant'));
      expect((error as Error).message).not.toContain(upstreamToken);
      expect((error as Error).message).not.toContain(sensitiveText);
    }
  });
});
