package com.example.REMS.Service;

import com.example.REMS.DTO.BuildingDTO;
import com.example.REMS.Entity.BuildingEntity;
import com.example.REMS.Entity.UserEntity;
import com.example.REMS.Repository.BuildingRepository;
import com.example.REMS.Repository.UserRepository;
import com.google.cloud.storage.BlobId;
import com.google.cloud.storage.BlobInfo;
import com.google.cloud.storage.Storage;
import lombok.RequiredArgsConstructor;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.util.List;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class BuildingService {

    private static final Logger logger = LoggerFactory.getLogger(BuildingService.class);
    private final BuildingRepository buildingRepository;
    private final UserRepository userRepository;

    // GCS 업로드용 (PostService와 동일한 방식)
    private final Storage storage;
    @Value("${google.cloud.credentials.header}")
    private String googleCloudHeader;          // 공개 URL 접두사
    @Value("${google.cloud.storage.bucket}")
    private String bucket;                      // GCS 버킷명

    private void checkAuth(String uid, UserDetails userDetails) {
        if (userDetails == null || !userDetails.getUsername().equals(uid)) {
            throw new RuntimeException("권한이 없습니다");
        }
    }

    private UserEntity getAuthorizedUser(String uid, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        return userRepository.findByUid(uid)
                .orElseThrow(() -> new IllegalArgumentException("사용자를 찾을 수 없습니다"));
    }

    private void checkOwner(BuildingEntity building, String uid) {
        if (building.getOwner() == null || !building.getOwner().getUid().equals(uid)) {
            throw new RuntimeException("해당 건물에 대한 권한이 없습니다");
        }
    }

    // 미디어 파일을 GCS에 업로드하고 공개 URL 반환
    private String uploadMedia(MultipartFile mediaFile) {
        if (mediaFile == null || mediaFile.isEmpty()) return null;
        try {
            UUID uuid = UUID.randomUUID();
            String original = mediaFile.getOriginalFilename();
            String ext = (original != null && original.contains(".")) ? original.substring(original.lastIndexOf(".")) : "";
            String fileName = uuid.toString() + ext;

            String contentType;
            switch (ext.toLowerCase()) {
                case ".jpg":
                case ".jpeg": contentType = "image/jpeg"; break;
                case ".png":  contentType = "image/png";  break;
                case ".bmp":  contentType = "image/bmp";  break;
                case ".gif":  contentType = "image/gif";  break;
                case ".webp": contentType = "image/webp"; break;
                case ".mp4":  contentType = "video/mp4";  break;
                case ".avi":  contentType = "video/avi";  break;
                case ".wmv":  contentType = "video/wmv";  break;
                case ".mpeg": contentType = "video/mpeg"; break;
                default:      contentType = "application/octet-stream";
            }

            BlobId blobId = BlobId.of(bucket, fileName);
            BlobInfo blobInfo = BlobInfo.newBuilder(blobId)
                    .setContentType(contentType)
                    .setContentDisposition("inline; filename=" + original)
                    .build();
            storage.create(blobInfo, mediaFile.getBytes());
            return googleCloudHeader + fileName;
        } catch (IOException e) {
            throw new RuntimeException("미디어 파일 업로드 중 오류가 발생했습니다.", e);
        }
    }

    // 건물 추가 (작성자 = 토큰의 사용자, 미디어 파일 선택)
    @Transactional
    public BuildingDTO createBuilding(String uid, BuildingDTO buildingDTO, MultipartFile mediaFile, UserDetails userDetails) {
        UserEntity owner = getAuthorizedUser(uid, userDetails);
        BuildingEntity buildingEntity = buildingDTO.dtoToEntity(owner);

        String mediaURL = uploadMedia(mediaFile);
        if (mediaURL != null) buildingEntity.setMediaURL(mediaURL);

        BuildingEntity savedBuilding = buildingRepository.save(buildingEntity);
        logger.info("건물 등록 완료! 작성자: {}, id={}, media={}", uid, savedBuilding.getId(), mediaURL);
        return BuildingDTO.entityToDto(savedBuilding);
    }

    @Transactional(readOnly = true)
    public List<BuildingDTO> getAllBuildings(String uid, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        List<BuildingDTO> buildings = buildingRepository.findAll().stream()
                .map(BuildingDTO::entityToDto)
                .collect(Collectors.toList());
        logger.info("전체 건물 {}개 조회 완료! 요청자: {}", buildings.size(), uid);
        return buildings;
    }

    @Transactional(readOnly = true)
    public BuildingDTO findById(String uid, Long id, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity buildingEntity = buildingRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        logger.info("{}번 건물 조회 완료! 요청자: {}", id, uid);
        return BuildingDTO.entityToDto(buildingEntity);
    }

    @Transactional(readOnly = true)
    public List<BuildingDTO> search(String uid, String keyword, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        return buildingRepository.searchAll(keyword).stream()
                .map(BuildingDTO::entityToDto)
                .collect(Collectors.toList());
    }

    @Transactional(readOnly = true)
    public List<BuildingDTO> findByType(String uid, String type, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        return buildingRepository.findByType(type).stream()
                .map(BuildingDTO::entityToDto)
                .collect(Collectors.toList());
    }

    // 건물 수정 — 작성자 본인만 (미디어 파일을 새로 주면 이미지 교체, 없으면 기존 유지)
    @Transactional
    public BuildingDTO updateBuilding(String uid, BuildingDTO buildingDTO, MultipartFile mediaFile, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity buildingEntity = buildingRepository.findById(buildingDTO.getId())
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        checkOwner(buildingEntity, uid);

        buildingEntity.setName(buildingDTO.getName());
        buildingEntity.setAddress(buildingDTO.getAddress());
        buildingEntity.setDetailAddress(buildingDTO.getDetailAddress());
        buildingEntity.setType(buildingDTO.getType());
        buildingEntity.setLat(buildingDTO.getLat());
        buildingEntity.setLng(buildingDTO.getLng());
        buildingEntity.setDeposit(buildingDTO.getDeposit());
        buildingEntity.setRent(buildingDTO.getRent());
        buildingEntity.setManage(buildingDTO.getManage());
        buildingEntity.setMemo(buildingDTO.getMemo());

        // 새 미디어 파일이 있으면 교체, 없으면 기존 이미지 유지
        String newMedia = uploadMedia(mediaFile);
        if (newMedia != null) buildingEntity.setMediaURL(newMedia);

        logger.info("{}번 건물 수정 완료! 작성자: {}, mediaChanged={}", buildingEntity.getId(), uid, newMedia != null);
        return BuildingDTO.entityToDto(buildingEntity);
    }

    // 건물 삭제 — 작성자 본인만 (cascade로 호실까지 삭제)
    @Transactional
    public BuildingDTO deleteBuilding(String uid, Long id, UserDetails userDetails) {
        checkAuth(uid, userDetails);
        BuildingEntity buildingEntity = buildingRepository.findById(id)
                .orElseThrow(() -> new IllegalArgumentException("건물을 찾을 수 없습니다"));
        checkOwner(buildingEntity, uid);
        BuildingDTO deleted = BuildingDTO.entityToDto(buildingEntity);
        buildingRepository.delete(buildingEntity);
        logger.info("{}번 건물 삭제 완료! 작성자: {}", id, uid);
        return deleted;
    }
}