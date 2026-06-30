package com.example.REMS.DTO;

import com.example.REMS.Entity.BuildingEntity;
import com.example.REMS.Entity.UserEntity;
import lombok.*;

import java.util.*;
import java.util.stream.Collectors;

@NoArgsConstructor
@AllArgsConstructor
@Getter
@Setter
@Builder
public class BuildingDTO {
    private Long id;
    private String name;
    private String address;
    private String detailAddress;   // 상세주소
    private String type;            // house/multiplex/officetel/commercial
    private double lat;
    private double lng;
    private int deposit;            // 보증금 (만원)
    private int rent;               // 월세 (만원)
    private int manage;             // 관리비 (만원)
    private String memo;
    private String ownerUid;        // 작성자 uid (응답 표시용, 읽기 전용)

    // 이미지 URL 목록
    //  - 응답(엔티티→DTO): 현재 저장된 이미지 전체
    //  - 수정 요청(DTO→서비스): "유지할 기존 이미지" 목록 (UI에서 제거한 건 빠진 상태로 옴)
    @Builder.Default
    private List<String> mediaURLs = new ArrayList<>();

    @Builder.Default
    private List<UnitDTO> units = new ArrayList<>();

    // 휴지통 이동 시각(epoch millis). null 이면 정상. 응답 표시용(읽기 전용).
    private Long deletedAt;

    // 거래유형 (sale=매매 / jeonse=전세 / monthly=월세)
    private String dealType;

    // 전세 대출 가능 여부 + 종류
    private Boolean jeonseLoanAvailable;
    private String jeonseLoanType;
    // 옵션 — 주차 / 애완
    private Boolean parkingAvailable;
    private Boolean petAllowed;

    // 등록 일시(epoch millis). 응답 표시용(읽기 전용) — 프론트에서 날짜만 표시.
    private Long createdAt;

    public static BuildingDTO entityToDto(BuildingEntity buildingEntity) {
        List<UnitDTO> unitDTOs = buildingEntity.getUnits().stream()
                .map(UnitDTO::entityToDto)
                .collect(Collectors.toList());
        String ownerUid = (buildingEntity.getOwner() != null) ? buildingEntity.getOwner().getUid() : null;

        List<String> mediaURLs = (buildingEntity.getMediaURLs() != null)
                ? new ArrayList<>(buildingEntity.getMediaURLs())
                : new ArrayList<>();

        Long deletedAtMillis = (buildingEntity.getDeletedAt() != null)
                ? buildingEntity.getDeletedAt().atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                : null;

        Long createdAtMillis = (buildingEntity.getCreatedAt() != null)
                ? buildingEntity.getCreatedAt().atZone(java.time.ZoneId.systemDefault()).toInstant().toEpochMilli()
                : null;

        return new BuildingDTO(
                buildingEntity.getId(),
                buildingEntity.getName(),
                buildingEntity.getAddress(),
                buildingEntity.getDetailAddress(),
                buildingEntity.getType(),
                buildingEntity.getLat(),
                buildingEntity.getLng(),
                buildingEntity.getDeposit(),
                buildingEntity.getRent(),
                buildingEntity.getManage(),
                buildingEntity.getMemo(),
                ownerUid,
                mediaURLs,
                unitDTOs,
                deletedAtMillis,
                buildingEntity.getDealType(),
                buildingEntity.getJeonseLoanAvailable(),
                buildingEntity.getJeonseLoanType(),
                buildingEntity.getParkingAvailable(),
                buildingEntity.getPetAllowed(),
                createdAtMillis);
    }

    public BuildingEntity dtoToEntity(UserEntity owner) {
        BuildingEntity buildingEntity = BuildingEntity.builder()
                .id(id)
                .name(name)
                .address(address)
                .detailAddress(detailAddress)
                .type(type)
                .lat(lat)
                .lng(lng)
                .deposit(deposit)
                .rent(rent)
                .manage(manage)
                .memo(memo)
                .dealType(dealType)
                .jeonseLoanAvailable(jeonseLoanAvailable)
                .jeonseLoanType(jeonseLoanType)
                .parkingAvailable(parkingAvailable)
                .petAllowed(petAllowed)
                .mediaURLs(mediaURLs != null ? new ArrayList<>(mediaURLs) : new ArrayList<>())
                .owner(owner)
                .units(new ArrayList<>())
                .build();

        if (units != null) {
            for (UnitDTO unitDTO : units) {
                buildingEntity.addUnit(unitDTO.dtoToEntity(owner));
            }
        }
        return buildingEntity;
    }

    public BuildingEntity dtoToEntity() {
        return dtoToEntity(null);
    }
}
