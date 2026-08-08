/**
 * @file    ev_control.c
 * @brief   Electric Vehicle dynamics model
 *
 * Computes:
 *   • Motor torque from accelerator pedal + drive-mode scale
 *   • Regenerative braking torque from brake pedal
 *   • Vehicle speed via inertia model (simple Euler integration)
 *   • Instantaneous power (kW)
 *   • State-of-Charge via energy integration
 *   • Estimated range from SOC and drive-mode efficiency
 *
 * ADC channels (12-bit, 0–4095 → 0–100 %):
 *   PA0 = accel pedal, PA1 = brake pedal,
 *   PA2 = SOC (initial), PA3 = motor temperature
 */

#include "ev_control.h"
#include "event_manager.h"
#include "dal_adc.h"
#include <stdio.h>

/* ─── Drive-mode torque scaling table ────────────────────────────────────── */
static const float TORQUE_MAP[3] = {
    0.6f,   /* ECO    — 60 % max torque */
    1.0f,   /* NORMAL */
    1.3f,   /* SPORT  — 130 % boost     */
};

/* ─── ADC rank → channel mapping (matches CubeMX Injected/Regular config) ── */
#define ADC_RANK_ACCEL  0
#define ADC_RANK_BRAKE  1
#define ADC_RANK_SOC    2
#define ADC_RANK_TEMP   3
#define ADC_CHANNELS    4

static uint32_t adc_buf[ADC_CHANNELS];

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * @brief  Initialise EV handle to safe defaults (PARKED cold state).
 */
void EV_Init(EV_HandleTypeDef *ev)
{
    memset(ev, 0, sizeof(*ev));
    ev->soc        = 100.0f;
    ev->drive_mode = DRIVE_MODE_NORMAL;
    ev->motor_temp = 25.0f;    /* ambient */
    ev->speed_kmh = 20;
    ev->state = STATE_PARKED;

    ev->override_temp_active = 0;
    ev->override_temp_val    = 0.0f;
    ev->override_soc_active  = 0;
    ev->override_soc_val     = 0.0f;
}

/**
 * @brief  Read ADC channels via Driver Abstraction Layer and map to
 *         pedal/temp values. Call once per EV_Update cycle.
 */
void EV_ReadADC(EV_HandleTypeDef *ev)
{
    ev->accel_pedal = DAL_ADC_ReadPercent(DAL_ADC_ACCEL);
    ev->brake_pedal = DAL_ADC_ReadPercent(DAL_ADC_BRAKE);

    if (ev->override_temp_active) {
        ev->motor_temp = ev->override_temp_val;
    } else {
        ev->motor_temp = DAL_ADC_ReadTemperature();
    }
}

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * @brief  Core EV model update — call at 100 Hz (dt = 0.01 s).
 *
 * @param  ev   Pointer to EV handle (already populated by EV_ReadADC).
 * @param  dt   Time step in seconds (nominally 0.01).
 */
void EV_Update(EV_HandleTypeDef *ev, float dt)
{
    uint8_t prev_state = ev->state;

	switch (ev->state)
	        {
	            case STATE_PARKED:
	                ev->motor_torque = 0;
	                ev->regen_level  = 0;
	                /* Transition: pedal pressed → READY */
	                if (ev->accel_pedal > 2.0f)
	                    ev->state = STATE_READY;
	                return;  /* skip physics when parked */

	            case STATE_READY:
	                ev->state = STATE_DRIVING;  /* or add a key/button interlock here */
	                return;

	            case STATE_DRIVING:
	                if (ev->brake_pedal > EV_REGEN_THRESHOLD_PCT)
	                    ev->state = STATE_REGEN;
	                break;  /* fall through to normal physics */

	            case STATE_REGEN:
	                if (ev->brake_pedal <= EV_REGEN_THRESHOLD_PCT)
	                    ev->state = STATE_DRIVING;
	                break;  /* fall through — regen torque already set below */

	            case STATE_FAULT:
	                ev->motor_torque = 0;
	              //  ev->speed_kmh    = 0;
	                return;  /* freeze everything */
	        }

    float mode_scale = TORQUE_MAP[ev->drive_mode];

    /* ── 1. Motor torque from accelerator ─────────────────────────────────── */
        //ev->motor_torque = ev->accel_pedal * EV_MAX_TORQUE_NM * mode_scale;
        ev->motor_torque = (ev->accel_pedal / 100.0f) * EV_MAX_TORQUE_NM * mode_scale;

        /* ── 2. Regenerative braking ──────────────────────────────────────────── */
        if (ev->brake_pedal > EV_REGEN_THRESHOLD_PCT) {
              /* 0–70 % scale */
            ev->regen_level  = ev->brake_pedal * 0.7f;
            ev->motor_torque = -(ev->regen_level / 100.0f) * EV_REGEN_TORQUE_MAX_NM;
            /* Simplified: torque = -regen_pct * max_regen_Nm */

        }

        /* ── 3. Speed — simple inertia model (Euler) ──────────────────────────── */
        /*    accel (m/s²) = (net_torque - drag) / mass_factor                    */
        /* Lumped drag in Nm (proportional to speed proxy) */
        float speed_ms = ev->speed_kmh / 3.6f;
        float drag_Nm  = speed_ms * EV_DRAG_COEFF;          /* Nm, e.g. coeff = 2.0 */
        float accel    = (ev->motor_torque - drag_Nm) / EV_MASS_FACTOR;  /* m/s² proxy */
        ev->speed_kmh  = CLAMP(ev->speed_kmh + accel * dt * 3.6f, 0.0f, EV_MAX_SPEED_KMH);

        /* ── 4. Instantaneous power ───────────────────────────────────────────── */
        /* Mechanical power: P_mech (kW) = T (Nm) × v (m/s) / 1000              */
        float v_ms = ev->speed_kmh / 3.6f;
        float p_mech_kw = ev->motor_torque * v_ms / 1000.0f;

        /* Motor copper losses (I²R): proportional to torque², non-zero at       */
        /* standstill. This is the current draw even when the vehicle is stopped. */
        /* Without this term, power_kw = 0 at v=0 → SOC never changes at rest.  */
        float torque_ratio = ev->motor_torque / EV_MAX_TORQUE_NM;
        float p_loss_kw    = torque_ratio * torque_ratio * 5.0f;  /* up to 5 kW  */

        ev->power_kw = p_mech_kw + p_loss_kw;

        /* ── 5. SOC integration ───────────────────────────────────────────────── */
        if (ev->override_soc_active) {
            ev->soc = ev->override_soc_val;
        } else {
            float delta_soc = (ev->power_kw * dt)
                              / (EV_BATTERY_CAPACITY_KWH * 3600.0f)
                              * 100.0f
                              * EV_SIM_SCALE;
            ev->soc = CLAMP(ev->soc - delta_soc, 0.0f, 100.0f);
        }

        /* ── 6. Estimated range ───────────────────────────────────────────────── */
        float eff_whpkm = (ev->drive_mode == DRIVE_MODE_ECO)
                           ? EV_EFFICIENCY_ECO
                           : EV_EFFICIENCY_OTHER;
        /* remaining Wh = soc% × capacity_kWh × 1000 */
        float remaining_wh = (ev->soc / 100.0f) * EV_BATTERY_CAPACITY_KWH * 1000.0f;
        ev->range_km = remaining_wh / eff_whpkm;

        /* ── 7. Motor thermal model (simple warm-up/cool-down) ───────────────── */
        if (ev->override_temp_active) {
            ev->motor_temp = ev->override_temp_val;
        } else {
            float thermal_power = fabsf(ev->power_kw) * 0.05f;  /* 5 % loss = heat */
            float cooling       = (ev->motor_temp - 25.0f) * 0.01f;
            ev->motor_temp += (thermal_power - cooling) * dt;
            ev->motor_temp  = CLAMP(ev->motor_temp, 25.0f, 130.0f);
        }

    /* Check state transitions and publish events */
    if (ev->state != prev_state) {
        if (prev_state == STATE_PARKED && (ev->state == STATE_READY || ev->state == STATE_DRIVING)) {
            EventManager_Publish(EVENT_VEHICLE_STARTED, EVENT_SEVERITY_INFO, EVENT_SOURCE_EV, "Vehicle systems started");
            EventManager_Publish(EVENT_TRIP_STARTED, EVENT_SEVERITY_INFO, EVENT_SOURCE_EV, "Trip tracking initialized");
        } else if (ev->state == STATE_PARKED && prev_state != STATE_PARKED) {
            EventManager_Publish(EVENT_VEHICLE_STOPPED, EVENT_SEVERITY_INFO, EVENT_SOURCE_EV, "Vehicle systems stopped");
            EventManager_Publish(EVENT_TRIP_STOPPED, EVENT_SEVERITY_INFO, EVENT_SOURCE_EV, "Trip tracking finalized");
        } else if (ev->state == STATE_FAULT) {
            EventManager_Publish(EVENT_EMERGENCY_STOP, EVENT_SEVERITY_CRITICAL, EVENT_SOURCE_EV, "Emergency safety stop triggered");
        }
    }
}

/* ─────────────────────────────────────────────────────────────────────────── */

void EV_SetDriveMode(EV_HandleTypeDef *ev, uint8_t mode)
{
    if (mode <= DRIVE_MODE_SPORT) {
        if (ev->drive_mode != mode) {
            const char* mode_names[] = {"ECO", "NORMAL", "SPORT"};
            char desc[40];
            sprintf(desc, "Drive Mode: %s", mode_names[mode]);
            ev->drive_mode = mode;
            EventManager_Publish(EVENT_DRIVE_MODE_CHANGED, EVENT_SEVERITY_INFO, EVENT_SOURCE_EV, desc);
        }
    }
}

void EV_InjectSpeed(EV_HandleTypeDef *ev, float speed_kmh)
{
    ev->speed_kmh = CLAMP(speed_kmh, 0.0f, EV_MAX_SPEED_KMH);
}

void EV_InjectSOC(EV_HandleTypeDef *ev, float soc_pct)
{
    if (soc_pct < 0.0f) {
        ev->override_soc_active = 0;
    } else {
        ev->override_soc_active = 1;
        ev->override_soc_val    = CLAMP(soc_pct, 0.0f, 100.0f);
        ev->soc                 = ev->override_soc_val;
    }
}

void EV_InjectMotorTemp(EV_HandleTypeDef *ev, float temp_c)
{
    if (temp_c < 0.0f) {
        ev->override_temp_active = 0;
    } else {
        ev->override_temp_active = 1;
        ev->override_temp_val    = CLAMP(temp_c, 0.0f, 130.0f);
        ev->motor_temp           = ev->override_temp_val;
    }
}
