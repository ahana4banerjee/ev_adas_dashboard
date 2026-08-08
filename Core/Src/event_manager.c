/**
 * @file    event_manager.c
 * @brief   Circular queue event publisher and flusher implementation
 */

#include "event_manager.h"
#include <string.h>
#include <stdio.h>

/* Handle to USART hardware configuration defined in main.c */
extern UART_HandleTypeDef huart1;

/* ─── Private Definitions & Variables ────────────────────────────────────── */
#define EVENT_QUEUE_SIZE 16

static Event_t event_queue[EVENT_QUEUE_SIZE];
static volatile uint32_t head = 0;
static volatile uint32_t tail = 0;

/* ─── API Implementations ────────────────────────────────────────────────── */

void EventManager_Init(void)
{
    head = 0;
    tail = 0;
}

void EventManager_Publish(EventType_t type, EventSeverity_t severity, EventSource_t source, const char *description)
{
    // Save current PRIMASK and disable global interrupts for safe critical sections
    uint32_t primask = __get_PRIMASK();
    __disable_irq();

    uint32_t next = (head + 1) % EVENT_QUEUE_SIZE;

    if (next == tail) {
        // Buffer full: drop oldest event by advancing tail index
        tail = (tail + 1) % EVENT_QUEUE_SIZE;
    }

    event_queue[head].timestamp = HAL_GetTick();
    event_queue[head].type      = type;
    event_queue[head].severity  = severity;
    event_queue[head].source    = source;
    
    strncpy(event_queue[head].description, description, sizeof(event_queue[head].description) - 1);
    event_queue[head].description[sizeof(event_queue[head].description) - 1] = '\0';

    head = next;

    // Restore original interrupt state
    if (!primask) {
        __enable_irq();
    }
}

uint8_t EventManager_Dequeue(Event_t *event)
{
    uint8_t success = 0;

    uint32_t primask = __get_PRIMASK();
    __disable_irq();

    if (head != tail) {
        *event = event_queue[tail];
        tail = (tail + 1) % EVENT_QUEUE_SIZE;
        success = 1;
    }

    if (!primask) {
        __enable_irq();
    }

    return success;
}

void EventManager_ProcessQueue(void)
{
    Event_t ev;
    char buffer[160];
    while (EventManager_Dequeue(&ev)) {
        int len = sprintf(buffer, "[EVENT] %lu,%s,%s,%s,%s\r\n",
                          (unsigned long)ev.timestamp,
                          EventSeverity_ToString(ev.severity),
                          EventSource_ToString(ev.source),
                          EventType_ToString(ev.type),
                          ev.description);
        if (len > 0) {
            HAL_UART_Transmit(&huart1, (uint8_t*)buffer, len, 100);
        }
    }
}

/* ─── Helper Utilities ───────────────────────────────────────────────────── */

const char* EventSeverity_ToString(EventSeverity_t severity)
{
    switch (severity) {
        case EVENT_SEVERITY_INFO:     return "INFO";
        case EVENT_SEVERITY_WARNING:  return "WARNING";
        case EVENT_SEVERITY_CRITICAL: return "CRITICAL";
        default:                      return "UNKNOWN";
    }
}

const char* EventSource_ToString(EventSource_t source)
{
    switch (source) {
        case EVENT_SOURCE_SYS:   return "SYS";
        case EVENT_SOURCE_EV:    return "EV";
        case EVENT_SOURCE_ADAS:  return "ADAS";
        case EVENT_SOURCE_FAULT: return "FAULT";
        case EVENT_SOURCE_SHELL: return "SHELL";
        default:                 return "UNKNOWN";
    }
}

const char* EventType_ToString(EventType_t type)
{
    switch (type) {
        case EVENT_DRIVE_MODE_CHANGED: return "DRIVE_MODE_CHANGED";
        case EVENT_VEHICLE_STARTED:    return "VEHICLE_STARTED";
        case EVENT_VEHICLE_STOPPED:    return "VEHICLE_STOPPED";
        case EVENT_FCW_WARNING:        return "FCW_WARNING";
        case EVENT_BSD_WARNING:        return "BSD_WARNING";
        case EVENT_CRITICAL_COLLISION: return "CRITICAL_COLLISION";
        case EVENT_MOTOR_OVERHEAT:     return "MOTOR_OVERHEAT";
        case EVENT_BATTERY_LOW:        return "BATTERY_LOW";
        case EVENT_FAULT_CLEARED:      return "FAULT_CLEARED";
        case EVENT_TRIP_STARTED:       return "TRIP_STARTED";
        case EVENT_TRIP_STOPPED:       return "TRIP_STOPPED";
        case EVENT_CONFIG_CHANGED:     return "CONFIG_CHANGED";
        case EVENT_EMERGENCY_STOP:     return "EMERGENCY_STOP";
        default:                       return "UNKNOWN";
    }
}
