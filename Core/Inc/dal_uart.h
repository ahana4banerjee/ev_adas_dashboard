/**
 * @file    dal_uart.h
 * @brief   Driver Abstraction Layer (DAL) for UART communication
 */

#ifndef DAL_UART_H
#define DAL_UART_H

#include "common.h"

/**
 * @brief  Initialize UART abstraction with a HAL UART handle.
 * @param  huart Pointer to UART handle
 */
void DAL_UART_Init(UART_HandleTypeDef *huart);

/**
 * @brief  Transmit raw binary bytes over UART.
 * @param  data   Pointer to data buffer
 * @param  length Number of bytes to transmit
 */
void DAL_UART_Transmit(const uint8_t *data, uint16_t length);

/**
 * @brief  Transmit a null-terminated string over UART.
 * @param  str String to transmit
 */
void DAL_UART_TransmitString(const char *str);

#endif /* DAL_UART_H */
