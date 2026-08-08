/**
 * @file    dal_uart.c
 * @brief   Driver Abstraction Layer (DAL) for UART communication implementation
 */

#include "dal_uart.h"
#include <string.h>

static UART_HandleTypeDef *_huart = NULL;

void DAL_UART_Init(UART_HandleTypeDef *huart)
{
    _huart = huart;
}

void DAL_UART_Transmit(const uint8_t *data, uint16_t length)
{
    if (_huart && data && length > 0) {
        HAL_UART_Transmit(_huart, (uint8_t*)data, length, 100);
    }
}

void DAL_UART_TransmitString(const char *str)
{
    if (_huart && str) {
        HAL_UART_Transmit(_huart, (uint8_t*)str, strlen(str), 100);
    }
}
