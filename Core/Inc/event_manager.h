/**
 * @file    event_manager.h
 * @brief   Event-driven diagnostic logging and message queue interface
 */

#ifndef EVENT_MANAGER_H
#define EVENT_MANAGER_H

#include "common.h"

/* ─── Event Severity Levels ──────────────────────────────────────────────── */
typedef enum {
    EVENT_SEVERITY_INFO,
    EVENT_SEVERITY_WARNING,
    EVENT_SEVERITY_CRITICAL
} EventSeverity_t;

/* ─── Event Source Modules ───────────────────────────────────────────────── */
typedef enum {
    EVENT_SOURCE_SYS,   /* General board or clock subsystems */
    EVENT_SOURCE_EV,    /* EV Control & dynamics module      */
    EVENT_SOURCE_ADAS,  /* ADAS safety calculation engine    */
    EVENT_SOURCE_FAULT, /* Fault monitoring task             */
    EVENT_SOURCE_SHELL  /* CLI parser & command terminal     */
} EventSource_t;

/* ─── Event Identifiers ──────────────────────────────────────────────────── */
typedef enum {
    EVENT_DRIVE_MODE_CHANGED,
    EVENT_VEHICLE_STARTED,
    EVENT_VEHICLE_STOPPED,
    EVENT_FCW_WARNING,
    EVENT_BSD_WARNING,
    EVENT_CRITICAL_COLLISION,
    EVENT_MOTOR_OVERHEAT,
    EVENT_BATTERY_LOW,
    EVENT_FAULT_CLEARED,
    EVENT_TRIP_STARTED,
    EVENT_TRIP_STOPPED,
    EVENT_CONFIG_CHANGED,
    EVENT_EMERGENCY_STOP
} EventType_t;

/* ─── Event Record Definition ────────────────────────────────────────────── */
typedef struct {
    uint32_t timestamp;
    EventType_t type;
    EventSeverity_t severity;
    EventSource_t source;
    char description[64];
} Event_t;

/* ─── API Prototypes ─────────────────────────────────────────────────────── */

/**
 * @brief  Initialize the circular event queue.
 */
void EventManager_Init(void);

/**
 * @brief  Publish a new event to the circular buffer queue (Interrupt safe).
 * @param  type         The EventType_t identifier
 * @param  severity     The event severity level
 * @param  source       The originating source module
 * @param  description  Text detail formatting string
 */
void EventManager_Publish(EventType_t type, EventSeverity_t severity, EventSource_t source, const char *description);

/**
 * @brief  Pop the oldest event from the queue.
 * @param  event  Output pointer to receive event record
 * @return 1 if event was successfully dequeued, 0 if queue is empty
 */
uint8_t EventManager_Dequeue(Event_t *event);

/**
 * @brief  Drain queued events and transmit formatted lines over UART.
 */
void EventManager_ProcessQueue(void);

/* Helper string conversion utilities */
const char* EventSeverity_ToString(EventSeverity_t severity);
const char* EventSource_ToString(EventSource_t source);
const char* EventType_ToString(EventType_t type);

#endif /* EVENT_MANAGER_H */
