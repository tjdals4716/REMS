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
    private String mediaURL;        // 대표 이미지/미디어 URL

    @Builder.Default
    private List<UnitDTO> units = new ArrayList<>();

    public static BuildingDTO entityToDto(BuildingEntity buildingEntity) {
        List<UnitDTO> unitDTOs = buildingEntity.getUnits().stream()
                .map(UnitDTO::entityToDto)
                .collect(Collectors.toList());
        String ownerUid = (buildingEntity.getOwner() != null) ? buildingEntity.getOwner().getUid() : null;

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
                buildingEntity.getMediaURL(),
                unitDTOs);
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
                .mediaURL(mediaURL)
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